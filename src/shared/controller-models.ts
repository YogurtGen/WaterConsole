import { control, type StudioControl, type Theme } from "./studio-model";
export const CONSOLE_MODELS = [
  { id: "action", name: "Action button" },
  { id: "primary", name: "Primary action" },
  { id: "face", name: "Face button" },
  { id: "shoulder", name: "Shoulder button" },
  { id: "petals", name: "Petal D-pad" },
  { id: "analog", name: "Analog disc" },
] as const;
export function consoleControl(model: string, theme: Theme): StudioControl {
  let c: StudioControl;
  if (model === "petals") {
    c = control("dpad", "Navigate", 80, 140, 240, 240);
    c.dpadStyle = "petals";
  } else if (model === "analog")
    c = control("stick", "Move", 80, 150, 190, 190);
  else if (model === "face") {
    c = control("button", "A", 650, 260, 90, 90, ["a"]);
    c.shape = "circle";
  } else if (model === "shoulder") {
    c = control("button", "LB", 80, 50, 170, 60, ["l"]);
    c.shape = "pill";
  } else {
    c = control(
      "button",
      model === "primary" ? "Confirm" : "Action",
      570,
      170,
      260,
      90,
      ["a"],
    );
    c.radius = 24;
  }
  c.appearance = model === "primary" ? "primary" : "console";
  if (model === "primary")
    c.theme = {
      button: theme.accent,
      text: theme.background,
      border: theme.accent,
    };
  return c;
}
