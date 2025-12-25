const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ArchAngel", function () {
  it("Should deploy ArchAngel contract", async function () {
    const [deployer] = await ethers.getSigners();
    // Use test addresses for router, factory, priceFeed
    const router = deployer.address;
    const factory = deployer.address;
    const priceFeed = deployer.address;
    const minLiquidityInWeth = 1;
    const buyUsdAmount = 1;
    const profitPercent = 1;
    const maxActivePositions = 1;
    const ArchAngel = await ethers.getContractFactory("ArchAngel");
    const archAngel = await ArchAngel.deploy(
      router,
      factory,
      priceFeed,
      minLiquidityInWeth,
      buyUsdAmount,
      profitPercent,
      maxActivePositions
    );
    // ethers v6: contract is deployed after deploy(), use .target for address
    expect(archAngel.target).to.match(/^0x[a-fA-F0-9]{40}$/);
  });
});
