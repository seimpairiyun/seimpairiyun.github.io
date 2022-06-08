let nav = document.getElementsByTagName("nav")[0];
let rowBingo = document.getElementsByTagName("tr");
let divCover = document.getElementsByTagName("main")[0];
let divBingo = document.getElementsByTagName("bingo")[0];
let bingoNum = document.getElementsByTagName("td");
let win = document.getElementsByClassName("btn-success");
let captionBingo = document.getElementsByClassName("caption")[0];
let shareBtn = document.getElementsByClassName("share")[0];

let bingo = [];
let idx = [
  //[0, 5, 10, 15, 20, 25]
  {
    start: 0,
    end: 5,
  },
  {
    start: 5,
    end: 10,
  },
  {
    start: 10,
    end: 15,
  },
  {
    start: 15,
    end: 20,
  },
  {
    start: 20,
    end: 25,
  },
];

function showBingo() {
  nav.classList.remove("d-none");
  divBingo.classList.remove("d-none");
  divCover.classList.add("d-none");
}

// initializing Bingo
function assignBingo(index) {
  for (let i = 0; i < 120; i++) {
    bingo.push(Math.ceil(Math.random() * 99));
  }

  let bingoUniq = [...new Set(bingo)];
  let bingoVar = bingoUniq.slice(idx[index].start, idx[index].end); //.join(' - ')

  return bingoVar;
}

//! Score
let Null = [0, 0, 0, 0, 0];
let bingoScore = [[Null], [Null], [Null], [Null], [Null]];
let _bingoScore = [[...Null], [...Null], [...Null], [...Null], [...Null]];

// Showing Score
Score(assignBingo);
function Score(fn) {
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      bingoScore[i][j] = fn(i)[j];
      //_bingoScore[i][j] = fn(i)[j];
    }
  }

  //console.table(bingoScore);
  //console.table(_bingoScore);
  return bingoScore;
}

// Put into table
function render(indexRow) {
  assignBingo(indexRow).forEach((e, i) => {
    let addColumn = document.createElement("td");
    let addText = document.createTextNode(assignBingo(indexRow)[i]);
    //document.createTextNode(assignBingo(indexRow)[i])

    addColumn.appendChild(addText);
    rowBingo[indexRow].appendChild(addColumn);
  });
}

// Generate New Bingo Number
function generateBingo(n = 99) {
  bingoScore = [[Null], [Null], [Null], [Null], [Null]];
  _bingoScore = [[...Null], [...Null], [...Null], [...Null], [...Null]];

  let newBingo = [];
  for (let i = 0; i < 9999; i++) {
    newBingo.push(Math.ceil(Math.random() * n));
  }

  let bingoUniq = [...new Set(newBingo)];

  let bingoNumber = document.getElementsByTagName("td");
  for (let i = 0; i < bingoNumber.length; i++) {
    bingoNumber[i].innerText = bingoUniq[i];
    bingoNumber[i].classList.remove("bg-warning");
    bingoNumber[i].classList.remove("fw-bold");
  }

  let bingoVar = (index) => bingoUniq.slice(idx[index].start, idx[index].end); //.join(' - ')

  console.clear();
  Score(bingoVar);

  //console.log(bingoUniq);
  //console.log(bingoScore);
  for (let i = 0; i < 5; i++) {
    win[i].classList.add("d-none");
  }

  return bingoUniq;
}

// Render Bingo Number
for (let i = 0; i < 5; i++) {
  render(i);
}

//! Get Index Score ==> bug ketika hapus number
function changeScore(from, to = 1) {
  let r = [];
  let c = [];

  try {
    bingoScore.forEach((e, i) => {
      let num = bingoScore[i].indexOf(from);
      if (num != -1) {
        r.push(num);
        c.push(i);
      }
    });

    _bingoScore[c][r] = to;
  } catch (e) {
    console.log(e);
  }
}

// Get Bingo Number
try {
  for (var i = 0; i <= bingoNum.length; i++) {
    bingoNum[i].addEventListener("click", clickHandler);
  }

  function clickHandler() {
    // Bingo Number
    let bingo = parseInt(this.textContent);
    //alert(bingo);

    // Change score
    changeScore(bingo);
    console.clear();

    // Original Score
    //console.table(bingoScore);
    // Copy Score => we use
    isBingo();
    //console.table(_bingoScore);

    if (this.className) changeScore(bingo, 0);
    // toggle color number
    this.classList.toggle("bg-warning");
    this.classList.toggle("fw-bold");
  }
} catch (e) {
  console.log();
}

// BINGO WINNER CHECK
function isBingo() {
  // Win Combination
  let bCheck = ["B", "I", "N", "G", "O"];
  let Combination = [
    ...horzCombination(),
    ...vertCombination(),
    dLeftCombination(),
    dRightCombination(),
  ];

  console.log(Combination);

  let i = Combination.filter((e) => e == "11111").length - 1;
  if (i == -1) {
    win[0].classList.add("d-none");
    captionBingo.innerText = "Choose your Number!";
  } else if (i == 0) {
    captionBingo.innerText = "Wow! You got one!";
    win[0].classList.remove("d-none");
    win[1].classList.add("d-none");
    win[2].classList.add("d-none");
    win[3].classList.add("d-none");
    win[4].classList.add("d-none");
  } else if (i == 1) {
    captionBingo.innerText = "Damn! Almost three!";
    win[1].classList.remove("d-none");
    win[2].classList.add("d-none");
    win[3].classList.add("d-none");
    win[4].classList.add("d-none");
  } else if (i == 2) {
    captionBingo.innerText = "Nice, find the GO!";
    win[2].classList.remove("d-none");
    win[3].classList.add("d-none");
    win[4].classList.add("d-none");
  } else if (i == 3) {
    captionBingo.innerText = "Almost there!";
    win[3].classList.remove("d-none");
    win[4].classList.add("d-none");
  } else if (i == 4) {
    captionBingo.innerText = "CONGRATULATION, BINGO!!";
    win[4].classList.remove("d-none");
    win[4].classList.remove("d-none");
    shareBtn.classList.remove("d-none");
  }

  //console.log(i);
  console.log(bCheck[i] ?? "Not Yet");
}

// Horizontal Combination
function horzCombination() {
  let h = [];
  for (let i = 0; i < 5; i++) {
    h.push(_bingoScore[i].join(""));
  }

  return h;
}

// Vertical Combination
function vertCombination() {
  let v = [];
  for (let i = 0; i < 5; i++) {
    v.push(
      _bingoScore
        .map((x) => x[i])
        .reverse()
        .join("")
    );
  }
  return v;
}

// Diagonal Combination
function dLeftCombination() {
  let n = [];
  for (let i = 0; i < 5; i++) {
    for (let j = 0; j < 5; j++) {
      if (i === j) {
        //console.log(i, j);
        n.push(_bingoScore[i][j]);
      }
    }
  }
  return n.join("");
}

function dRightCombination() {
  let n = [];
  for (let i = 4; i > -1; i--) {
    for (let j = 0; j < 5; j++) {
      if (i + j == 4) {
        //console.log(i, j);
        n.push(_bingoScore[i][j]);
      }
    }
  }
  return n.join("");
}

// Animation
(function randomMoves() {
  anime({
    targets: "td",
    easing: "easeInOutQuad",
    duration: 1750,
    complete: randomMoves,
    translateY: () => anime.random(-5, 5),
  });
})();
