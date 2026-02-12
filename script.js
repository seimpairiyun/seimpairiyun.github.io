//MAGIC BUTTON
var magic_open = false;
window.addEventListener("load", () => {
  const menu = document.querySelector(".logo-button");

  menu.addEventListener("click", () => {
    const icon = document.querySelector("#logo-icon");
    if (magic_open == true) {
      magic_open = false;

      menu.title = menu.title.replace(/Tutup/, "Lihat");
      menu.classList.remove("logo-button-open");
      icon.classList.remove("fa-remove");
      //icon.classList.add('fa-tree')

      var menu_point = document.querySelectorAll(".logo-point");
      for (let i = 0; i < menu_point.length; i++) {
        menu_point[i].classList.remove("logo-point-open");
        setTimeout(function () {
          menu_point[i].hidden = true;
        }, 800);
      }
    } else {
      magic_open = true;

      menu.title = menu.title.replace(/Lihat/, "Tutup");
      menu.classList.add("logo-button-open");
      icon.classList.remove("fa-thumbs-up");
      //icon.classList.add('fa-times')

      var menu_point = document.querySelectorAll(".logo-point");
      for (let i = 0; i < menu_point.length; i++) {
        menu_point[i].hidden = false;
        setTimeout(function () {
          menu_point[i].classList.add("logo-point-open");
        }, 200);
      }
    }
  });
});
