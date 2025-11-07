// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/*
  ArchAngel (reworked)
  - Added basic safety (nonReentrant)
  - Added token-introspection helpers (staticcall) that don't revert
  - Changed router.WETH signature to view
  - Added events and small safety improvements
  - Note: heavy checks (Etherscan verification, honeypot detection, locked LP checks)
    should be performed off-chain by your bot before calling buyNewToken().
*/

interface IUniswapV2Router02 {
    function WETH() external view returns (address);

    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external payable;

    function swapExactTokensForETHSupportingFeeOnTransferTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) external;

    function getAmountsOut(
        uint amountIn,
        address[] calldata path
    ) external view returns (uint[] memory amounts);
}

interface IUniswapV2Factory {
    function getPair(
        address tokenA,
        address tokenB
    ) external view returns (address pair);
}

interface IERC20 {
    function totalSupply() external view returns (uint);

    function balanceOf(address) external view returns (uint);

    function approve(address spender, uint amount) external returns (bool);

    function transfer(address to, uint amount) external returns (bool);

    function decimals() external view returns (uint8);
}

interface AggregatorV3Interface {
    function latestRoundData()
        external
        view
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        );

    function decimals() external view returns (uint8);
}

library SafeERC20 {
    function safeApprove(IERC20 token, address spender, uint value) internal {
        require(token.approve(spender, value), "SafeERC20: approve failed");
    }

    function safeTransfer(IERC20 token, address to, uint value) internal {
        require(token.transfer(to, value), "SafeERC20: transfer failed");
    }
}

abstract contract Ownable {
    address public owner;
    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "owner only");
        _;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "zero");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }
}

/* Minimal reentrancy guard */
abstract contract ReentrancyGuard {
    uint8 private _status;

    constructor() {
        _status = 1;
    } // 1 = not entered, 2 = entered

    modifier nonReentrant() {
        require(_status == 1, "reentrant");
        _status = 2;
        _;
        _status = 1;
    }
}

contract ArchAngel is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    string public constant BOT_NAME = "ARCH ANGEL";

    IUniswapV2Router02 public router;
    IUniswapV2Factory public factory;
    AggregatorV3Interface public priceFeed; // Chainlink ETH/USD

    uint public minLiquidityInWeth; // in wei
    uint public buyUsdAmount; // e.g., 10 (dollars)
    uint public profitPercent; // e.g., 20 => sell when position >= 20% profit
    uint public maxActivePositions;
    bool public restrictBuyToOwner = false; // optional safety: only owner may call buyNewToken

    struct Position {
        address token;
        uint amountToken; // amount tokens bought
        uint costEth; // total ETH spent (wei)
        bool active;
        uint openedAt;
    }

    Position[] public positions;
    uint public activeCount;

    event Bought(
        address indexed token,
        uint amountToken,
        uint costEth,
        uint positionId
    );
    event Sold(
        address indexed token,
        uint amountToken,
        uint returnedEth,
        uint positionId
    );
    event PositionClosed(uint positionId);
    event ParamsUpdated();
    event TokenIntrospection(
        address token,
        uint totalSupply,
        uint8 decimals,
        bool ok
    );
    event TokenSkipped(address token, string reason);

    constructor(
        address _router,
        address _factory,
        address _priceFeed,
        uint _minLiquidityInWeth,
        uint _buyUsdAmount,
        uint _profitPercent,
        uint _maxActivePositions
    ) {
        require(
            _router != address(0) && _factory != address(0),
            "bad addresses"
        );
        router = IUniswapV2Router02(_router);
        factory = IUniswapV2Factory(_factory);
        priceFeed = AggregatorV3Interface(_priceFeed);
        minLiquidityInWeth = _minLiquidityInWeth;
        buyUsdAmount = _buyUsdAmount;
        profitPercent = _profitPercent;
        maxActivePositions = _maxActivePositions;
    }

    receive() external payable {} // allow contract to receive ETH

    // ======= Helper getters =======
    function weth() public view returns (address) {
        return router.WETH();
    }

    /// Convert USD amount to ETH (wei) using Chainlink ETH/USD feed.
    function usdToEthWei(uint usdAmount) public view returns (uint) {
        (, int price, , , ) = priceFeed.latestRoundData();
        require(price > 0, "invalid price");
        uint feedDecimals = priceFeed.decimals();
        uint usdTimesDecimals = usdAmount * (10 ** feedDecimals);
        uint ethWei = (usdTimesDecimals * 1 ether) / uint(price);
        return ethWei;
    }

    // Get expected ETH amount if we were to swap amountToken -> ETH via router
    function getTokenToEthEstimate(
        uint amountToken,
        address token
    ) public view returns (uint) {
        address[] memory path = new address[](2);
        path[0] = token;
        path[1] = weth();
        uint[] memory outs = router.getAmountsOut(amountToken, path);
        return outs[outs.length - 1];
    }

    // Check pair exists and the WETH reserve >= minLiquidityInWeth
    function pairHasMinLiquidity(address token) public view returns (bool) {
        address pair = factory.getPair(token, weth());
        if (pair == address(0)) return false;
        // attempt low-level staticcall to getReserves()
        (bool success, bytes memory data) = pair.staticcall(
            abi.encodeWithSignature("getReserves()")
        );
        if (!success || data.length < 96) return false;
        (uint112 reserve0, uint112 reserve1, ) = abi.decode(
            data,
            (uint112, uint112, uint32)
        );
        (bool ok0, bytes memory t0) = pair.staticcall(
            abi.encodeWithSignature("token0()")
        );
        (bool ok1, bytes memory t1) = pair.staticcall(
            abi.encodeWithSignature("token1()")
        );
        if (!ok0 || !ok1) return false;
        address token0 = abi.decode(t0, (address));
        address token1 = abi.decode(t1, (address));
        uint wethReserve;
        if (token0 == weth()) wethReserve = uint(reserve0);
        else if (token1 == weth()) wethReserve = uint(reserve1);
        else return false;
        return wethReserve >= minLiquidityInWeth;
    }

    // === Token introspection helpers (best-effort; do not revert) ===
    function tryTokenTotalSupply(
        address token
    ) public view returns (uint totalSupply, bool ok) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("totalSupply()")
        );
        if (success && data.length >= 32) {
            totalSupply = abi.decode(data, (uint));
            ok = true;
        } else {
            totalSupply = 0;
            ok = false;
        }
    }

    function tryTokenDecimals(
        address token
    ) public view returns (uint8 decimalsOut, bool ok) {
        (bool success, bytes memory data) = token.staticcall(
            abi.encodeWithSignature("decimals()")
        );
        if (success && data.length >= 32) {
            decimalsOut = uint8(uint256(abi.decode(data, (uint256))));
            ok = true;
        } else {
            decimalsOut = 18; // default assumption
            ok = false;
        }
    }

    // Optional toggle to restrict buys to owner (safe mode)
    function setRestrictBuyToOwner(bool v) external onlyOwner {
        restrictBuyToOwner = v;
        emit ParamsUpdated();
    }

    // ======= Core buy function - can be called by off-chain watcher (or owner) =======
    // NonReentrant to protect from reentrancy issues with router interactions
    function buyNewToken(
        address token,
        uint maxSlippageBps
    ) external nonReentrant returns (uint positionId) {
        if (restrictBuyToOwner) require(msg.sender == owner, "owner only");

        require(activeCount < maxActivePositions, "max active reached");
        require(pairHasMinLiquidity(token), "pair lacks min liquidity");

        uint ethAmount = usdToEthWei(buyUsdAmount);
        require(
            address(this).balance >= ethAmount,
            "insufficient ETH in contract"
        );

        // Optional token introspection (emit event for bot telemetry)
        (uint totalSupply, bool tsOk) = tryTokenTotalSupply(token);
        (uint8 dec, bool dOk) = tryTokenDecimals(token);
        emit TokenIntrospection(token, totalSupply, dec, tsOk && dOk);

        address[] memory path = new address[](2);
        path[0] = weth();
        path[1] = token;

        // compute expected tokens (best-effort)
        uint[] memory amountsOut = router.getAmountsOut(ethAmount, path);
        uint expectedTokens = amountsOut[1];
        require(expectedTokens > 0, "router returned zero expected tokens");

        uint amountOutMin = expectedTokens -
            ((expectedTokens * maxSlippageBps) / 10000);

        uint beforeBalance = IERC20(token).balanceOf(address(this));

        // execute swap
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: ethAmount
        }(amountOutMin, path, address(this), block.timestamp + 300);

        uint afterBalance = IERC20(token).balanceOf(address(this));
        uint bought = afterBalance - beforeBalance;
        require(bought > 0, "zero tokens bought");

        Position memory pos = Position({
            token: token,
            amountToken: bought,
            costEth: ethAmount,
            active: true,
            openedAt: block.timestamp
        });
        positions.push(pos);
        positionId = positions.length - 1;
        activeCount += 1;

        emit Bought(token, bought, ethAmount, positionId);
    }

    // Owner can force-invest a specific ETH amount
    function buyNewTokenWithEth(
        address token,
        uint ethWeiAmount,
        uint maxSlippageBps
    ) external onlyOwner nonReentrant returns (uint positionId) {
        require(activeCount < maxActivePositions, "max active reached");
        require(pairHasMinLiquidity(token), "pair lacks min liquidity");
        require(address(this).balance >= ethWeiAmount, "insufficient ETH");

        address[] memory path = new address[](2);
        path[0] = weth();
        path[1] = token;

        uint[] memory amountsOut = router.getAmountsOut(ethWeiAmount, path);
        uint expectedTokens = amountsOut[1];
        require(expectedTokens > 0, "router returned zero expected tokens");

        uint amountOutMin = expectedTokens -
            ((expectedTokens * maxSlippageBps) / 10000);

        uint beforeBalance = IERC20(token).balanceOf(address(this));
        router.swapExactETHForTokensSupportingFeeOnTransferTokens{
            value: ethWeiAmount
        }(amountOutMin, path, address(this), block.timestamp + 300);
        uint afterBalance = IERC20(token).balanceOf(address(this));
        uint bought = afterBalance - beforeBalance;
        require(bought > 0, "zero tokens bought");

        Position memory pos = Position({
            token: token,
            amountToken: bought,
            costEth: ethWeiAmount,
            active: true,
            openedAt: block.timestamp
        });
        positions.push(pos);
        positionId = positions.length - 1;
        activeCount += 1;

        emit Bought(token, bought, ethWeiAmount, positionId);
    }

    // Compute whether a given position is profitable according to profitPercent.
    function isPositionProfitable(
        uint positionId
    ) public view returns (bool, uint expectedEthOut) {
        require(positionId < positions.length, "bad id");
        Position storage p = positions[positionId];
        require(p.active, "position inactive");
        expectedEthOut = getTokenToEthEstimate(p.amountToken, p.token);
        uint target = (p.costEth * (100 + profitPercent)) / 100;
        return (expectedEthOut >= target, expectedEthOut);
    }

    // Sell a specific position on-chain. Anyone can call.
    // `minEthOutBps` is percentage of expectedEthOut to require, expressed in BPS (0..10000).
    function sellPosition(
        uint positionId,
        uint minEthOutBps
    ) public nonReentrant {
        require(positionId < positions.length, "bad id");
        Position storage p = positions[positionId];
        require(p.active, "already closed");

        uint expectedEthOut = getTokenToEthEstimate(p.amountToken, p.token);
        if (minEthOutBps > 10000) minEthOutBps = 10000;
        uint minEthOut = (expectedEthOut * minEthOutBps) / 10000;

        IERC20 token = IERC20(p.token);
        // Approve router
        token.safeApprove(address(router), p.amountToken);

        address[] memory path = new address[](2);
        path[0] = p.token;
        path[1] = weth();

        uint balanceBefore = address(this).balance;

        router.swapExactTokensForETHSupportingFeeOnTransferTokens(
            p.amountToken,
            minEthOut,
            path,
            address(this),
            block.timestamp + 300
        );

        uint balanceAfter = address(this).balance;
        uint receivedEth = 0;
        if (balanceAfter > balanceBefore) {
            receivedEth = balanceAfter - balanceBefore;
        } else {
            receivedEth = expectedEthOut;
        }

        // Reset allowance (best-effort)
        token.safeApprove(address(router), 0);

        p.active = false;
        activeCount -= 1;
        emit Sold(p.token, p.amountToken, receivedEth, positionId);
    }

    // Check all active positions and sell the ones that meet profit target.
    // Note: if one sell reverts, the whole call reverts. Off-chain keepers should call sellPosition individually.
    function checkAndSellAll(uint minEthOutBpsForAll) external {
        uint len = positions.length;
        for (uint i = 0; i < len; i++) {
            if (!positions[i].active) continue;
            (bool ok, ) = isPositionProfitable(i);
            if (ok) {
                // attempt to sell. If sell fails, it will revert the whole function.
                sellPosition(i, minEthOutBpsForAll);
            }
        }
    }

    // ======= Owner controls & emergency functions =======
    function setRouter(address _router) external onlyOwner {
        require(_router != address(0));
        router = IUniswapV2Router02(_router);
        emit ParamsUpdated();
    }

    function setFactory(address _factory) external onlyOwner {
        require(_factory != address(0));
        factory = IUniswapV2Factory(_factory);
        emit ParamsUpdated();
    }

    function setPriceFeed(address _priceFeed) external onlyOwner {
        require(_priceFeed != address(0));
        priceFeed = AggregatorV3Interface(_priceFeed);
        emit ParamsUpdated();
    }

    function setMinLiquidityInWeth(
        uint _minLiquidityInWeth
    ) external onlyOwner {
        minLiquidityInWeth = _minLiquidityInWeth;
        emit ParamsUpdated();
    }

    function setBuyUsdAmount(uint _buyUsdAmount) external onlyOwner {
        buyUsdAmount = _buyUsdAmount;
        emit ParamsUpdated();
    }

    function setProfitPercent(uint _profitPercent) external onlyOwner {
        profitPercent = _profitPercent;
        emit ParamsUpdated();
    }

    function setMaxActivePositions(
        uint _maxActivePositions
    ) external onlyOwner {
        maxActivePositions = _maxActivePositions;
        emit ParamsUpdated();
    }

    // Owner can withdraw ETH or ERC20 in emergencies
    function rescueEth(address payable to, uint amount) external onlyOwner {
        (bool sent, ) = to.call{value: amount}("");
        require(sent, "eth transfer failed");
    }

    function rescueToken(
        address token,
        address to,
        uint amount
    ) external onlyOwner {
        IERC20(token).safeTransfer(to, amount);
    }

    // View helpers
    function positionsLength() external view returns (uint) {
        return positions.length;
    }

    function getPosition(uint idx) external view returns (Position memory) {
        return positions[idx];
    }
}
