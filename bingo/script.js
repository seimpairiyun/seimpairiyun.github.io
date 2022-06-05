let bingo = [];
let rowBingo = document.getElementsByTagName("tr");
let divCover = document.getElementsByTagName("main")[0];
let divBingo = document.getElementsByTagName("bingo")[0];
let bingoNum = document.getElementsByTagName("td");

function showBingo() {
  divBingo.classList.remove("d-none");
  divCover.classList.add("d-none");
}

function getNum(e) {
  alert(e.innerText);
}

function assignBingo(index) {
  for (let i = 0; i < 120; i++) {
    bingo.push(Math.ceil(Math.random() * 60));
  }

  //[0, 5, 10, 15, 20, 25]
  let idx = [
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

  let bingoUniq = [...new Set(bingo)];
  let bingoVar = bingoUniq.slice(idx[index].start, idx[index].end); //.join(' - ')

  //console.log(bingoVar)
  return bingoVar;
}

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
function generateBingo() {
  let newBingo = [];
  for (let i = 0; i < 999; i++) {
    newBingo.push(Math.ceil(Math.random() * 60));
  }

  let bingoUniq = [...new Set(newBingo)];

  let bingoNumber = document.getElementsByTagName("td");
  for (let i = 0; i < bingoNumber.length; i++) {
    bingoNumber[i].innerText = bingoUniq[i];
    bingoNumber[i].classList.add("n");
  }
}

// Render Bingo Number
for (let i = 0; i < 5; i++) {
  render(i);
}

// Get Bingo Number
try {
  for (var i = 0; i <= bingoNum.length; i++) {
    bingoNum[i].addEventListener("click", clickHandler);
  }

  function clickHandler() {
    //alert(this.textContent);
    this.classList.toggle("bg-warning");
    this.classList.toggle("fw-bold");
  }
} catch (e) {
  console.log();
}
//
