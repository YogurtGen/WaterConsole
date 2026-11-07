(() => {
  const motion = matchMedia("(prefers-reduced-motion: reduce)");
  const scene = document.querySelector(".console-scene");
  const tabs = [...document.querySelectorAll("[data-view]")];
  const panes = [...document.querySelectorAll(".screen-pane")];
  const caption = document.querySelector("#preview-caption");
  const options = document.querySelector(".lab-options");
  const world = document.querySelector(".lab-world");
  const orb = document.querySelector(".orb1");
  const pad = document.querySelector(".demo-pad");
  const knob = document.querySelector(".pad-knob");
  const aButton = document.querySelector(".demo-a");
  const bButton = document.querySelector(".demo-b");
  const captions = {
    home: "A familiar home for your local library. Controller Lab is included.",
    pair: "Scan the lobby QR. Approve each phone on the PC. Everyone gets their own slot.",
    lab: "A small, interactive illustration of Controller Lab. Try the phone controls below.",
  };
  let activeView = "home";
  let paneAnimation;
  let activePointer = null;
  let moveFrame = 0;
  let lastTime = 0;
  let direction = { x: 0, y: 0 };
  let position = { x: 0, y: 0 };
  let jumpAnimation;
  const keys = new Set();

  function neutral() {
    direction = { x: 0, y: 0 };
    keys.clear();
    activePointer = null;
    pad.classList.remove("dragging");
    knob.style.transform = "translate(0, 0)";
    cancelAnimationFrame(moveFrame);
    moveFrame = 0;
    lastTime = 0;
  }

  function setView(view, focus = false) {
    if (!captions[view]) return;
    neutral();
    paneAnimation?.cancel();
    activeView = view;
    scene.dataset.scene = view;
    tabs.forEach((tab) => {
      const selected = tab.dataset.view === view;
      tab.setAttribute("aria-selected", String(selected));
      tab.tabIndex = selected ? 0 : -1;
      if (selected && focus) tab.focus();
    });
    panes.forEach((pane) => {
      pane.hidden = pane.id !== `scene-${view}`;
    });
    options.hidden = view !== "lab";
    caption.textContent = captions[view];
    const pane = document.querySelector(`#scene-${view}`);
    if (!motion.matches)
      paneAnimation = pane.animate(
        [
          { opacity: 0, transform: "translateY(8px) scale(.99)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 360, easing: "cubic-bezier(.22,1,.36,1)" },
      );
  }

  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => setView(tab.dataset.view));
    tab.addEventListener("keydown", (event) => {
      let next;
      if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
      if (event.key === "ArrowLeft")
        next = (index + tabs.length - 1) % tabs.length;
      if (event.key === "Home") next = 0;
      if (event.key === "End") next = tabs.length - 1;
      if (next !== undefined) {
        event.preventDefault();
        setView(tabs[next].dataset.view, true);
      }
    });
  });

  document
    .querySelector("[data-open-lab]")
    .addEventListener("click", () => setView("lab"));
  document.querySelectorAll(".lab-options [data-layout]").forEach((button) => {
    button.addEventListener("click", () => {
      neutral();
      position = { x: 0, y: 0 };
      orb.style.transform = "";
      world.dataset.layout = button.dataset.layout;
      document.querySelector(".lab-mode-label").textContent = {
        shared: "Shared screen",
        "split-2": "Two viewports",
        "split-4": "Four viewports",
      }[button.dataset.layout];
      document
        .querySelectorAll(".lab-options [data-layout]")
        .forEach((other) =>
          other.setAttribute("aria-pressed", String(other === button)),
        );
      if (!motion.matches)
        world.animate([{ opacity: 0.3 }, { opacity: 1 }], {
          duration: 250,
          easing: "ease-out",
        });
    });
  });

  function renderPosition() {
    orb.style.transform = `translate(${position.x}px, ${position.y}px)`;
  }
  function move(now) {
    if (!direction.x && !direction.y) {
      moveFrame = 0;
      lastTime = 0;
      return;
    }
    const dt = Math.min((now - (lastTime || now)) / 1000, 0.04);
    lastTime = now;
    const split = world.dataset.layout !== "shared";
    const rangeX = world.clientWidth * (split ? 0.17 : 0.25);
    const rangeY =
      world.clientHeight * (world.dataset.layout === "split-4" ? 0.16 : 0.26);
    const speed = Math.max(35, world.clientWidth * 0.15);
    position.x = Math.max(
      -rangeX,
      Math.min(rangeX, position.x + direction.x * dt * speed),
    );
    position.y = Math.max(
      -rangeY,
      Math.min(rangeY, position.y + direction.y * dt * speed),
    );
    renderPosition();
    moveFrame = requestAnimationFrame(move);
  }
  function moveDirection(x, y) {
    direction = { x, y };
    const distance = pad.clientWidth * 0.22;
    knob.style.transform = `translate(${x * distance}px, ${y * distance}px)`;
    if (!moveFrame && (x || y)) moveFrame = requestAnimationFrame(move);
  }
  function pointerDirection(event) {
    const rect = pad.getBoundingClientRect();
    let x =
      (event.clientX - (rect.left + rect.width / 2)) / (rect.width * 0.35);
    let y =
      (event.clientY - (rect.top + rect.height / 2)) / (rect.height * 0.35);
    const distance = Math.hypot(x, y);
    if (distance < 0.18) return moveDirection(0, 0);
    if (distance > 1) {
      x /= distance;
      y /= distance;
    }
    moveDirection(x, y);
  }
  pad.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || activePointer !== null) return;
    if (activeView !== "lab") setView("lab");
    activePointer = event.pointerId;
    pad.setPointerCapture(event.pointerId);
    pad.classList.add("dragging");
    pad.focus({ preventScroll: true });
    pointerDirection(event);
    event.preventDefault();
  });
  pad.addEventListener("pointermove", (event) => {
    if (event.pointerId === activePointer) pointerDirection(event);
  });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"])
    pad.addEventListener(type, neutral);
  pad.addEventListener("keydown", (event) => {
    if (
      !["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].includes(event.key)
    )
      return;
    event.preventDefault();
    if (activeView !== "lab") setView("lab");
    keys.add(event.key);
    moveDirection(
      Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft")),
      Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp")),
    );
  });
  pad.addEventListener("keyup", (event) => {
    if (!keys.has(event.key)) return;
    event.preventDefault();
    keys.delete(event.key);
    moveDirection(
      Number(keys.has("ArrowRight")) - Number(keys.has("ArrowLeft")),
      Number(keys.has("ArrowDown")) - Number(keys.has("ArrowUp")),
    );
  });
  pad.addEventListener("blur", neutral);
  window.addEventListener("blur", neutral);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) neutral();
  });
  window.addEventListener("resize", () => {
    neutral();
    position = { x: 0, y: 0 };
    renderPosition();
  });

  aButton.addEventListener("click", () => {
    if (activeView !== "lab") setView("lab");
    jumpAnimation?.cancel();
    if (motion.matches) {
      orb.animate([{ opacity: 1 }, { opacity: 0.5 }, { opacity: 1 }], {
        duration: 180,
      });
      return;
    }
    jumpAnimation = orb.animate(
      [
        { translate: "0 0", scale: "1" },
        { translate: "0 -30px", scale: "1.15", offset: 0.45 },
        { translate: "0 0", scale: "1" },
      ],
      { duration: 420, easing: "cubic-bezier(.22,.7,.3,1)" },
    );
  });
  bButton.setAttribute("aria-label", "Reset preview player position");
  bButton.addEventListener("click", () => {
    if (activeView !== "lab") setView("lab");
    neutral();
    position = { x: 0, y: 0 };
    renderPosition();
  });

  if (!motion.matches && "IntersectionObserver" in window) {
    document.documentElement.classList.add("motion-ready");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.1, rootMargin: "0px 0px -25px 0px" },
    );
    document
      .querySelectorAll(".reveal")
      .forEach((element) => observer.observe(element));
  }
  motion.addEventListener("change", () => {
    if (motion.matches) {
      document.documentElement.classList.remove("motion-ready");
      paneAnimation?.cancel();
      jumpAnimation?.cancel();
    }
  });
})();
