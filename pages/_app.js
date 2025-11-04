// pages/_app.js
import '../styles/globals.css'; // optional, only if you have a styles folder

export default function MyApp({ Component, pageProps }) {
  return <Component {...pageProps} />;
}
