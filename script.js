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

width = $(window).width();

if (width <= 700) {
  $(".name").click(function () {
    $(".intro").css("right", "0");
    // $(".text").css("transform", "translateX(20px)")
    $(".wrapper").css("z-index", "20");
  });

  $(".close").click(function () {
    $(".intro").css("right", "-1000px");
  });

}

$("#arrow").click(function () {
  open.play();
  about.play();

  if (width <= 700) {
    $(".wrapper").css("z-index", "20");
    $(".intro").css("transform", "translateX:100px")
  }
});

$(".close").click(function () {
  close.play();
})

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
  targets: '.text',
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

var social_open = false
window.addEventListener('load', () => {
  const menu = document.querySelector('.social-button');

  menu.addEventListener('click', () => {
    const icon = document.querySelector('#social-icon');
    if (social_open == true) {
      social_open = false;

      menu.title = menu.title.replace(/Tutup/, "Lihat")
      menu.classList.remove('social-button-open')
      icon.classList.remove('fa-remove')
      //icon.classList.add('fa-tree')

      var menu_point = document.querySelectorAll(".social-point");
      for (let i = 0; i < menu_point.length; i++) {
        menu_point[i].classList.remove('social-point-open');
        setTimeout(function () {
          menu_point[i].hidden = true;
        }, 800)
      }
    } else {
      social_open = true;

      menu.title = menu.title.replace(/Lihat/, "Tutup")
      menu.classList.add('social-button-open');
      icon.classList.remove('fa-thumbs-up')
      //icon.classList.add('fa-times')

      var menu_point = document.querySelectorAll(".social-point");
      for (let i = 0; i < menu_point.length; i++) {
        menu_point[i].hidden = false;
        setTimeout(function () {
          menu_point[i].classList.add('social-point-open');
        }, 200)
      }
    }
  });
})

function getLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(showPosition);
  } else { 
    console.log('Not Supported');
  }
}

function showPosition(position) {
  console.log('Created by Mhd. Afizha Aw');
  console.log('Location: https://www.google.co.id/maps/place/'+position.coords.latitude+','+position.coords.longitude);
}

getLocation();

var request = new XMLHttpRequest();
request.open('GET', 'https://api.ipify.org?format=json'); //https://ifconfig.co/json');
request.setRequestHeader('Accept', 'application/json');
request.onreadystatechange = function () {
  if (this.readyState === 4) {
  data = JSON.parse(this.responseText)
	console.log('IP Public: '+data["ip"]);
  }
};
request.send();

//Initializing
var i = 0;
var images = []; //array
var time = 10000; // time in millie seconds

//images

images[0] = "url(img/weddcars.webp)";
images[1] = "url(img/cover.jpg)";
images[2] = "url(img/bride.jpg)";
//function

function changeImage() {
    var el = document.getElementById('body');
    el.style.backgroundImage = images[i];
    if (i < images.length - 1) {
        i++;
    } else {
        i = 0;
    }
    setTimeout('changeImage()', time);
}

window.onload = changeImage;