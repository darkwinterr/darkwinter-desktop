// Without an Apple Developer ID the Mac app isn't signed, and macOS calls an unsigned Apple Silicon app "damaged".
// An ad-hoc signature (codesign -s -) fixes that: people only need to right-click > Open the first time.
// When a Developer ID is set up later (CSC_LINK / CSC_KEY_PASSWORD in the GitHub settings), electron-builder signs it properly.
const { execFileSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(ctx) {
  if (ctx.electronPlatformName !== "darwin" || process.env.CSC_LINK) return;
  const app = path.join(ctx.appOutDir, `${ctx.packager.appInfo.productFilename}.app`);
  execFileSync("codesign", ["--force", "--deep", "--sign", "-", app], { stdio: "inherit" });
};
