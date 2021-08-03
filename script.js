/* Programmer */
console.log('Created with 💗 by Mhd. Afizha Aw');
console.log("Browser Resolution: " + window.innerWidth + " x " + window.innerHeight)
console.log("Screen Resolution: " + screen.width + " x " + screen.height)

//LOGO
$(document).ready(function () {
  $('.logo').hide().fadeIn(18000);
});

$(".logo").mouseover(function () {
  $(this).addClass("animated jello");
});

$(".logo").mouseout(function () {
  $(this).removeClass("animated jello");
});

setTimeout(function () {
  $(".loader").css("display", "none");
  loaded.play();
}, 2500);

//BUG
$(document).ready(function () {
  $('#buglist').DataTable({
    language: {
      searchPlaceholder: " Cari.."
    },
    "oLanguage": {
      "sSearch": ""
    },
    "paging": false,
    "info": false,
    "dom": '<<"filter__css"f>rt',
    "ordering": false,
    "scrollY": 200,
    "scrollX": true
  });
});

//INTRO
width = $(window).width();

if (width <= 700) {
  $(".name").click(function () {
    $(".intro").css("right", "0");
    $(".intro-container").css("z-index", "20");
  });

  $(".intro-close").click(function () {
    $(".intro").css("right", "-1000px");
  });

}

$("#intro-arrow").click(function () {
  open.play();
  about.play();

  if (width <= 700) {
    $(".intro-container").css("z-index", "20");
    $(".intro").css("transform", "translateX:100px")
  }
});

$(".intro-close").click(function () {
  close.play();
})

//BRAND ANIMATION
var loaded = anime({
  targets: '.name',
  scale: [{
    value: 3,
    duration: 100,
    elasticity: 100
  }, {
    value: 1,
    duration: 500,
    elasticity: 100
  }],
  duration: 4000,
  autoplay: false,

});

var open = anime({
  targets: '.intro',
  translateX: -1000,
  duration: 1000,
  autoplay: false
});

var close = anime({
  targets: '.intro',
  translateX: 1800,
  duration: 500,
  autoplay: false,
});

var about = anime({
  targets: '.intro-text',
  translateX: [{
    value: -200,
    duration: 100,
    elasticity: 100
  }, {
    value: 0,
    duration: 500,
    elasticity: 100
  }],
  delay: 200
});

//MAGIC BUTTON
var magic_open = false
window.addEventListener('load', () => {
  const menu = document.querySelector('.magic-button');

  menu.addEventListener('click', () => {
    const icon = document.querySelector('#magic-icon');
    if (magic_open == true) {
      magic_open = false;

      menu.title = menu.title.replace(/Tutup/, "Lihat")
      menu.classList.remove('magic-button-open')
      icon.classList.remove('fa-remove')
      //icon.classList.add('fa-tree')

      var menu_point = document.querySelectorAll(".magic-point");
      for (let i = 0; i < menu_point.length; i++) {
        menu_point[i].classList.remove('magic-point-open');
        setTimeout(function () {
          menu_point[i].hidden = true;
        }, 800)
      }
    } else {
      magic_open = true;

      menu.title = menu.title.replace(/Lihat/, "Tutup")
      menu.classList.add('magic-button-open');
      icon.classList.remove('fa-thumbs-up')
      //icon.classList.add('fa-times')

      var menu_point = document.querySelectorAll(".magic-point");
      for (let i = 0; i < menu_point.length; i++) {
        menu_point[i].hidden = false;
        setTimeout(function () {
          menu_point[i].classList.add('magic-point-open');
        }, 200)
      }
    }
  });
})

/* PERMODALAN */

//BUGLIST OPEN
function showBuglist() {
  document.getElementById('bug').style.display = 'none';
}

//SHOW BUG LIST 
const Bug_Array = JSON.parse(i_found_BUGs);
//console.log(Bug_Array.buglist[i].WebApp)

for (var i = 0; i < Bug_Array.buglist.length; i++) {
  document.getElementById("check").innerHTML +=
    '<tr>' +
    '<td>' + (i + 1) + '</td>' +
    '<td>' + Bug_Array.buglist[i].WebApp + '</td>' +
    '<td>' + Bug_Array.buglist[i].BugName + '</td>' +
    '<td>' + Bug_Array.buglist[i].Time + '</td>' +
    '<td>' + Bug_Array.buglist[i].Info + '</td>'
  '</tr>';
}

//BUGLIST CLOSE
function hideBuglist() {
  window.history.back(-2)
}

//CONSOLE: Programmer, Location and IP
function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition);
  } else {
    console.log('Not Supported');
  }
}

function showPosition(position) {
  console.log('Location: https://www.google.co.id/maps/place/' + position.coords.latitude + ',' + position.coords.longitude);
  document.querySelector('.logo').alt = position.coords.latitude + ',' + position.coords.longitude;
}

getLocation();

/* var request = new XMLHttpRequest();
request.open('GET', 'https://api.ipify.org?format=json'); //https://ifconfig.co/json');
request.setRequestHeader('Accept', 'application/json');
request.onreadystatechange = function () {
  if (this.readyState === 4) {
    data = JSON.parse(this.responseText)
    console.log('IP Public: ' + data["ip"]);
  }
};
request.send(); */

//BACKGROUND
var i = 0;
var images = []; //array
var time = 7000;

images[0] = "url(img/cover1.png)";
images[1] = "url(img/cover2.png)";
images[2] = "url(img/cover3.png)";
/* images[3] = "url(img/cover4.png)";
images[4] = "url(img/burger.jpg)";
images[5] = "url(img/menu1.jpg)";
images[6] = "url(img/menu2.jpg)";
images[7] = "url(img/menu3.jpg)";
images[8] = "url(img/menu4.jpg)";
images[9] = "url(img/menu5.jpg)";
images[10] = "url(img/menu6.jpg)";
images[11] = "url(img/menu7.jpg)";
images[12] = "url(img/menu8.jpg)";
images[13] = "url(img/menu9.jpg)";
images[14] = "url(img/menu10.jpg)";
images[15] = "url(img/oc5.jpg)";
images[16] = "url(img/oc3.jpg)";
images[17] = "url(img/wallpaper.jpg)"; */

function changeImage() {
  var el = document.getElementById('body');
  el.style.backgroundImage = images[i];
  if (i < images.length - 1) {
    i++;
  } else {
    i = 0;
  }

  /*   $("#background_cycler").fadeOut(1500, function () {
      $(this).css("background-image", images[i]);
      $(this).fadeIn(1500);
      $(this).hide().fadeIn(1500);
    }); */

  setTimeout('changeImage()', time);
}

window.onload = changeImage;


/* TERMINAL */

$(document).ready(function () {

  // COMMANDS
  function Welcome() {
    terminal.append("Welcome to My Terminal — Type <strong style='color:yellow'>help</strong> to view supported commands.\n\n");
  }

  function about() {
    var LOGO = document.querySelector('.logo').alt;

    if (LOGO != "not found") {
      YourLocation = "your location is <a style='color:#16b4ff' href='https://www.google.co.id/maps/place/" + LOGO + "' target=_blank>there</a>, wasnt it?";
    } else {
      YourLocation = "";
    }

    var me =
      'Hello.. ' + YourLocation + '\n\n' +
      'I like staring at laptop screen and doing some programming stuffs, or learning about web security.\n' +
      'So my biggest dream is being Bug Hunter in part time but i have to learn much more about that.\n\n' +
      'Okay, the first language i have learned is Visual Basic. VB is ancient language, so simple and old but sometime i use it for doing some macros in my job on Excel.\n' +
      'After that till now I`m learning <strong style="color:#777bb3">PHP</strong> and <strong style="color:yellow">Javascript</strong> for make a web. Of course, i learn SQL too, for manipulating web database and processing data. Then i meet <strong style="color:#376FA0">Pyt</strong><strong style="color:#FFD140">hon</strong>, the powerful language and good for make automation tools.\n\n' +
      'Now i`m work in One of Tax Office.\n'

    terminal.text("")
    terminal.append(me);
  }

  function banner() {
    var banner =
      "                 __                      __        __                              \n" +
      "    ______ ____ |__| _____ ___________  |__|______|__|___ __ __ __  ____           \n" +
      "   /  ___// __ \\|  |/     \\\\____ \\__  \\ |  \\_  __ \\  <   |  |  |  \\/    \\  \n" +
      "   \\___ \\\\  ___/|  |  Y Y  \\  |_> > __ \\|  ||  | \\/  |\\___  |  |  /   |  \\  \n" +
      "  /____  >\\___  >__|__|_|  /   __(____  /__||__|  |__|/ ____|____/|___|  /        \n" +
      "       \\/     \\/         \\/|__|       \\/              \\/               \\/    \n"

    terminal.text("");
    if (screen.width < 1030) {
      Welcome();
      terminal.append("Your resolution screen less than 1030px\n")
      $('.logo').addClass("animated jello");
    } else {
      terminal.append(banner + "\n");
      Welcome();
    }
  }

  function echo(args) {
    var str = args.join(" ");
    if (str == 'on') {
      $('.terminal-window').css('background-color', '');
      $('.container').css('box-shadow', '');
      terminal.append(str + "\n");
    } else if (str == 'off') {
      $('.terminal-window').css('background-color', 'rgba(0, 0, 0, 1)');
      $('.container').css({
        'box-shadow': 'rgb(58 149 213) 0px 0px 20px 5px',
        'border-bottom-left-radius': '5px',
        'border-bottom-right-radius': '5px'
      });
      terminal.append(str + "\n");
    } else {
      terminal.append(str + "\n");
    }

  }

  function clear() {
    terminal.text("");
    Welcome();
  }

  function help() {
    terminal.append("<strong style='color:#16b4ff'>Supported commands</strong>" + ": about, banner, echo, clear, help, quit.\n");
  }

  function quit() {
    window.history.back()
    clear();
  }
  // END COMMANDS


  //TERMINAL VARIABLE
  var title = $(".title");
  var terminal = $(".terminal");
  var prompt = "➜";
  var path = "~";

  var commandHistory = [];
  var historyIndex = 0;

  var command = "";
  var commands = [{
    "name": "about",
    "function": about
  }, {
    "name": "banner",
    "function": banner
  }, {
    "name": "echo",
    "function": echo
  }, {
    "name": "clear",
    "function": clear
  }, {
    "name": "help",
    "function": help
  }, {
    "name": "quit",
    "function": quit
  }];


  function processCommand() {
    var isValid = false;
    var args = command.split(" "); //this will split text to vertical
    var cmd = args[0];
    args.shift();


    //Create history command
    for (var i = 0; i < commands.length; i++) {
      if (cmd === commands[i].name) {
        commands[i].function(args);
        isValid = true;
        break;
      }
    }

    if (!isValid) {
      if (command == '') {
        terminal.append("command not recognized.\n");
      } else {
        terminal.append("command <strong style='color:red'>" + command + "</strong> not recognized\n");
      }
    }

    // Search command history and clean up.
    commandHistory.push(command);
    historyIndex = commandHistory.length;
    command = "";
  }

  //add new ➜ ~ onsubmit
  function displayPrompt() {
    terminal.append("<span class=\"prompt\">" + prompt + "</span> ");
    terminal.append("<span class=\"path\">" + path + "</span> ");
    terminal.append("<input class=\"cmd on\" type=\"text\">")
    $('.on').focus();
  }

  // Delete last character command
  function erase(n) {
    command = command.slice(0, -n);
    terminal.html(terminal.html().slice(0, -n));
  }

  function clearCommand() {
    if (command.length > 0) {
      erase(command.length);
    }
  }

  function appendCommand(str) {
    terminal.append(str);
    command += str;
  }

  /*
    //	Keypress doesn't catch special keys,
    //	so we catch the backspace here and
    //	prevent it from navigating to the previous
    //	page. We also handle arrow keys for command history.
    */

  $(document).keydown(function (e) {
    e = e || window.event;
    var keyCode = typeof e.which === "number" ? e.which : e.keyCode;

    // BACKSPACE
    if (keyCode === 8 && e.target.tagName !== "INPUT" && e.target.tagName !== "TEXTAREA") {
      e.preventDefault();
      if (command !== "") {
        erase(1);
      }
    }

    // UP or DOWN
    if (keyCode === 38 || keyCode === 40) {
      // Move up or down the history
      if (keyCode === 38) {
        // UP
        historyIndex--;
        if (historyIndex < 0) {
          historyIndex++;
        }
      } else if (keyCode === 40) {
        // DOWN
        historyIndex++;
        if (historyIndex > commandHistory.length - 1) {
          historyIndex--;
        }
      }

      // Get command
      var cmd = commandHistory[historyIndex];
      if (cmd !== undefined) {
        clearCommand();
        appendCommand(cmd);
      }
    }
  });

  $(document).keypress(function (e) {
    // Make sure we get the right event
    e = e || window.event;
    var keyCode = typeof e.which === "number" ? e.which : e.keyCode;

    // Which key was pressed?
    switch (keyCode) {
      // ENTER
      case 13:
        {
          terminal.append("\n");

          processCommand();
          displayPrompt();
          break;
        }
      default:
        {
          appendCommand(String.fromCharCode(keyCode));
        }
    }
  });

  // Terminal title

  title.text("afizh@root: ~ ");

  terminal.append(Welcome());

  displayPrompt();

  //FOCUS TO TRIGGER KEYBOARD
  $('.on').focus();

  //PRESS EVENT to add class on to trigger focus on last input
  $('.terminal').on('keypress', function (e) {
    var target = document.getElementsByClassName('cmd');

    for (var c = 0; c < target.length; c++) {
      command = target[c].value;
      target[c].classList.remove("on");
    }

  });
});

/* TERMINAL END */
