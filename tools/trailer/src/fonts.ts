import { loadFont } from "@remotion/fonts";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { F } from "./theme";

const handle = delayRender("Загрузка шрифтов");

Promise.all([
  loadFont({ family: F.title, url: staticFile("fonts/Unbounded_600SemiBold.ttf"), weight: "600" }),
  loadFont({ family: F.body, url: staticFile("fonts/Onest_400Regular.ttf"), weight: "400" }),
  loadFont({ family: F.body, url: staticFile("fonts/Onest_500Medium.ttf"), weight: "500" }),
  loadFont({ family: F.body, url: staticFile("fonts/Onest_600SemiBold.ttf"), weight: "600" }),
])
  .then(() => continueRender(handle))
  .catch((err) => cancelRender(err));
