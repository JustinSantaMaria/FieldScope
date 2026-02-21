import path from "path";
import { registerFont } from "canvas";

let done = false;

export function initCanvasFontsOnce() {
  if (done) return;
  done = true;

  const fontDir = path.join(process.cwd(), "server", "fonts");

  registerFont(path.join(fontDir, "Inter-Regular.ttf"), {
    family: "Inter",
    weight: "400",
    style: "normal",
  });

  registerFont(path.join(fontDir, "Inter-Bold.ttf"), {
    family: "Inter",
    weight: "700",
    style: "normal",
  });
}
