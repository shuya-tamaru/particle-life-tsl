import "./style.css";
import { bootstrap } from "./app/bootstrap";

window.addEventListener("load", () => {
  const deviceType = getDeviceType();
  const count = deviceType === "mobile" ? 2000 : 10000;
  const defaultAspect = deviceType === "mobile" ? 9 / 16 : 16 / 9;

  bootstrap(count, defaultAspect);
});

export function getDeviceType(): "desktop" | "mobile" | "tablet" {
  const ua = navigator.userAgent.toLowerCase();

  if (/mobile|iphone|ipod|android.*mobile/.test(ua)) {
    return "mobile";
  }
  if (/ipad|android(?!.*mobile)|tablet/.test(ua)) {
    return "tablet";
  }
  return "desktop";
}
