"use strict";

// The Elm bundle is loaded by renderer.html into the page scope.
const Elm = window.Elm;
const Mousetrap = require("mousetrap");
const helpers = require("../shared/doc-helpers");

let lastActivesScrolled = null;
let lastColumnScrolled = null;
let ticking = false;
let DIRTY = true;
let isUntitled = true;
let gingkoElectron;

window.elmMessages = [];

const localStore = {
  isReady: () => true,
  set: (key, value) => {
    window.electronAPI.localStoreSet(key, value);
  }
};

function init(filePath, fileData, fileSettings, undoData, isUntitledFlag) {
  const timestamp = Date.now();
  const globalData = {
    seed: timestamp,
    currentTime: timestamp,
    isMac: window.electronAPI.platform === "darwin"
  };

  gingkoElectron = Elm.Electron.Electron.init({
    flags: { filePath, fileData, fileSettings, undoData, globalData, isUntitled: isUntitledFlag }
  });

  gingkoElectron.ports.infoForOutside.subscribe((elmdata) => {
    fromElm(elmdata.tag, elmdata.data);
  });
}

window.electronAPI.fileReceived(async (event, data) => {
  DIRTY = data.fileData === null;
  isUntitled = data.isUntitled;
  init(data.filePath, data.fileData, data.fileSettings, data.undoData, data.isUntitled);
});

window.electronAPI.fileSaved((event, data) => {
  DIRTY = false;
  isUntitled = data[2];
  toElm(data.slice(0, 2), "docMsgs", "SavedToFile");
});

window.electronAPI.commitDataResult((event, data) => {
  toElm(data, "docMsgs", "DataSaved");
});

window.electronAPI.clickedExport(() => toElm(null, "docMsgs", "ClickedExport"));
window.electronAPI.clickedUndo(() => toElm("mod+z", "docMsgs", "Keyboard"));
window.electronAPI.clickedCut(() => toElm("mod+x", "docMsgs", "Keyboard"));
window.electronAPI.clickedCopy(() => toElm("mod+c", "docMsgs", "Keyboard"));
window.electronAPI.clickedPaste(() => toElm("mod+v", "docMsgs", "Keyboard"));
window.electronAPI.clickedPasteInto(() => toElm("mod+shift+v", "docMsgs", "Keyboard"));

window.checkboxClicked = (cardId, number) => {
  toElm([cardId, number], "docMsgs", "CheckboxClicked");
};

window.onbeforeunload = (e) => {
  if (isUntitled) {
    window.electronAPI.maybeCloseWindow();
    e.returnValue = false;
  } else if (DIRTY) {
    setTimeout(window.electronAPI.closeWindow, 200);
    e.returnValue = false;
  }
};

/* === Elm / JS Interop === */

function fromElm(msg, elmData) {
  window.elmMessages.push({ tag: msg, data: elmData });
  window.elmMessages = window.elmMessages.slice(-10);

  const casesElectron = {
    SetDirty: () => {
      DIRTY = elmData;
    },

    CommitData: () => {
      window.electronAPI.commitData(elmData);
    },

    DragStart: () => {
      const cardElement = elmData.target.parentElement;
      const cardId = cardElement.id.replace(/^card-/, "");
      elmData.dataTransfer.setDragImage(cardElement, 0, 0);
      elmData.dataTransfer.setData("text", "");
      toElm(cardId, "docMsgs", "DragStarted");
    },

    ExportToFile: () => {
      window.electronAPI.exportFile(elmData);
    },

    SaveToFile: () => {
      window.electronAPI.saveFile(elmData);
    }
  };

  const params = { localStore, lastColumnScrolled, lastActivesScrolled, ticking, DIRTY };
  const cases = Object.assign(helpers.casesShared(elmData, params), casesElectron);

  try {
    cases[msg]();
  } catch (err) {
    console.error("Unexpected message from Elm : ", msg, elmData, err);
  }
}

function toElm(data, portName, tagName) {
  const portExists = Object.prototype.hasOwnProperty.call(gingkoElectron.ports, portName);
  const tagGiven = typeof tagName === "string";

  if (portExists) {
    const dataToSend = tagGiven ? { tag: tagName, data } : data;
    gingkoElectron.ports[portName].send(dataToSend);
  } else {
    console.error("Unknown port", portName, data);
  }
}

/* === Keyboard === */

const desktopShortcuts = helpers.shortcuts.filter((x) => x !== "mod+s" && x !== "mod+o");

Mousetrap.bind(desktopShortcuts, function (e, s) {
  switch (s) {
    case "enter":
      if (document.activeElement.nodeName === "TEXTAREA") {
        return;
      }
      toElm("enter", "docMsgs", "Keyboard");
      break;

    case "mod+c": {
      const exportPreview = document.getElementById("export-preview");
      if (exportPreview !== null) return;
      toElm("mod+c", "docMsgs", "Keyboard");
      break;
    }

    case "mod+v":
    case "mod+shift+v": {
      const elmTag = s === "mod+v" ? "Paste" : "PasteInto";
      window.electronAPI
        .readClipboard()
        .then((clipString) => {
          try {
            toElm(JSON.parse(clipString), "docMsgs", elmTag);
          } catch {
            toElm(clipString, "docMsgs", elmTag);
          }
        })
        .catch((err) => console.error("clipboard read failed", err));
      break;
    }

    case "alt+0":
    case "alt+1":
    case "alt+2":
    case "alt+3":
    case "alt+4":
    case "alt+5":
    case "alt+6": {
      if (document.activeElement.nodeName === "TEXTAREA") {
        const num = Number(s[s.length - 1]);
        const currentText = document.activeElement.value;
        const newText = currentText.replace(
          /^(#{0,6}) ?(.*)/,
          num === 0 ? "$2" : "#".repeat(num) + " $2"
        );
        document.activeElement.value = newText;
        DIRTY = true;
        toElm(newText, "docMsgs", "FieldChanged");

        const cardElementId = document.activeElement.id.replace(/^card-edit/, "card");
        const card = document.getElementById(cardElementId);
        if (card !== null) card.dataset.clonedContent = newText;
      }
      break;
    }

    default:
      toElm(s, "docMsgs", "Keyboard");
  }

  if (helpers.needOverride.includes(s)) {
    return false;
  }
});

/* === DOM manipulation === */

const observer = helpers.getObserver(toElm);
observer.observe(document.body, { childList: true, subtree: true });
