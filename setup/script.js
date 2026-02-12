let screen = false;

const tag = (n) => document.querySelectorAll(n);
const web = location.origin;

tag("#play")[0].addEventListener("click", () => {
  if (screen) {
    screen = false;
    tag("iframe")[0].src = "./img/desktop1-kali.gif";
    tag("iframe")[1].src = "./img/desktop1-bsod.png";
    tag("label")[1].setAttribute("title", "PC lemot dilarang klik!");
  } else {
    screen = true;
    tag("label")[1].setAttribute("title", "Matikan monitor");
    tag("iframe")[0].src = `../fancy/rider`;
    tag("iframe")[1].src = location.origin;
  }
});

const root = document.documentElement;
let currentX = -24;
let currentY = -24;
let targetX = -24;
let targetY = -24;

document.addEventListener("mousemove", (e) => {
  const x = (e.clientX / innerWidth - 0.5) * 1.5;
  const y = (e.clientY / innerHeight - 0.5) * -1.5;

  targetY = x * 45;
  targetX = -y * -24;
});

function animate() {
  currentX += (targetX - currentX) * 0.05;
  currentY += (targetY - currentY) * 0.05;

  root.style.setProperty("--rotate-x", currentX.toFixed(2));
  root.style.setProperty("--rotate-y", currentY.toFixed(2));

  requestAnimationFrame(animate);
}

animate();

let isRot = true;
window.addEventListener("click", () => {
  isRot = !isRot;
  if (targetX != currentX) {
    targetX = currentX;
    targetY = currentY;
  }
});

// TERMINAL
tag("#cmd")[0].addEventListener("click", () => {
  tag(".terminal-window")[0].classList.toggle("hide");
});

tag(".close")[0].addEventListener("click", () => {
  tag(".terminal-window")[0].classList.toggle("hide");
  console.log(1);
});

var title = tag(".title")[0];
var terminal = tag(".terminal")[0];
var prompt = "➜";
var path = "~";
title.innerText = "afizh@root: ~ ";
