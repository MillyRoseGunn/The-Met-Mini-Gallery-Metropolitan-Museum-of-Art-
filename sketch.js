// - keyword search -> object ids
// - fetch object details until we get MAX_ITEMS (at the moment that's 18) with images
// - preload thumbnails so drawing is easy
// - draw a grid of images
// - hover = tooltip with title + artist
// - click = open met page 

let loading = false;
let errMsg = null;

let items = []; // each item becomes { objectID, title, artist, date, imageUrl, img, x, y, w, h }

const MAX_ITEMS = 18;        // how many we try to show
const GRID_COLS = 6;         // basic grid, tweak if you want
const PAD = 20;              // outer padding
const GAP = 10;              // gap between tiles

const randomWords = ["mask", "robot", "weaving", "portrait", "myth", "dream", "moon", "sword", "cat", "bird", "gold", "game"];

function setup() {
  const c = createCanvas(900, 560);
  c.parent("canvas-holder");
  textFont("system-ui");

  const qEl = document.getElementById("query");
  document.getElementById("go").addEventListener("click", () => {
    const q = qEl.value.trim();
    if (q) searchMet(q);
  });

  qEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") document.getElementById("go").click();
  });

  document.getElementById("rand").addEventListener("click", () => {
    const w = random(randomWords);
    qEl.value = w;
    searchMet(w);
  });

  searchMet(qEl.value.trim());
}

function draw() {
  background(255);

  if (loading) {
    drawMsg("loading…");
    return;
  }
  if (errMsg) {
    drawMsg("error: " + errMsg);
    return;
  }
  if (items.length === 0) {
    drawMsg("no images yet. try another keyword.");
    return;
  }

  // draw grid
  for (const it of items) {
    if (it.img) {
      image(it.img, it.x, it.y, it.w, it.h);
    } else {
      // fallback tile if image failed
      noStroke();
      fill(0, 25);
      rect(it.x, it.y, it.w, it.h);
    }
  }

  // hover tooltip (title + artist)
  const hover = getHoveredItem(mouseX, mouseY);
  if (hover) drawTooltip(hover);
}

function mousePressed() {
  // optional: click to open the met page for that object
  const hover = getHoveredItem(mouseX, mouseY);
  if (hover) {
    const url = `https://www.metmuseum.org/art/collection/search/${hover.objectID}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

function drawMsg(msg) {
  noStroke();
  fill(0, 180);
  textSize(16);
  text(msg, 24, 40);
}

function setStatus(msg) {
  const el = document.getElementById("status");
  if (el) el.textContent = msg;
}

async function searchMet(query) {
  loading = true;
  errMsg = null;
  items = [];
  setStatus(`searching met for "${query}"…`);

  try {
    const searchUrl =
      `https://collectionapi.metmuseum.org/public/collection/v1/search?hasImages=true&q=${encodeURIComponent(query)}`;

    const res = await fetch(searchUrl, { headers: { "accept": "application/json" } });
    if (!res.ok) throw new Error(`search http ${res.status}`);

    const json = await res.json();
    const ids = json.objectIDs || [];

    if (ids.length === 0) {
      setStatus(`no matches for "${query}".`);
      loading = false;
      return;
    }

    setStatus(`found ${ids.length} ids. fetching details + thumbnails…`);

    // fetch object details one by one until we have enough
    const picked = [];
    for (let i = 0; i < ids.length && picked.length < MAX_ITEMS; i++) {
      const obj = await fetchObject(ids[i]);
      if (obj) picked.push(obj);
    }

    if (picked.length === 0) {
      setStatus(`found stuff but none had usable images. try another keyword.`);
      loading = false;
      return;
    }

    // now preload images (still sequential, keep it simple / polite)
    items = [];
    for (let i = 0; i < picked.length; i++) {
      const base = picked[i];
      const img = await loadP5Image(base.imageUrl);

      items.push({
        ...base,
        img,
        x: 0, y: 0, w: 0, h: 0
      });

      setStatus(`loading thumbnails… ${i + 1}/${picked.length}`);
    }

    layoutGrid();
    setStatus(`loaded ${items.length} images for "${query}". hover for info, click to open met page.`);
  } catch (e) {
    errMsg = e.message;
    setStatus("error: " + errMsg);
  } finally {
    loading = false;
  }
}

async function fetchObject(objectID) {
  try {
    const url = `https://collectionapi.metmuseum.org/public/collection/v1/objects/${objectID}`;
    const res = await fetch(url, { headers: { "accept": "application/json" } });
    if (!res.ok) return null;

    const d = await res.json();

    // small image url (fast)
    const imgUrl = d.primaryImageSmall || "";
    if (!imgUrl) return null;

    return {
      objectID: d.objectID,
      title: d.title || "(untitled)",
      artist: d.artistDisplayName || "(unknown artist)",
      date: d.objectDate || "",
      imageUrl: imgUrl
    };
  } catch {
    return null;
  }
}

function loadP5Image(url) {
  // promise wrapper around p5 loadImage
  return new Promise((resolve) => {
    loadImage(
      url,
      (img) => resolve(img),
      () => resolve(null)
    );
  });
}

function layoutGrid() {
  // super simple fixed grid layout
  const cols = GRID_COLS;
  const rows = ceil(items.length / cols);

  const usableW = width - PAD * 2;
  const usableH = height - PAD * 2;

  const tileW = (usableW - GAP * (cols - 1)) / cols;
  const tileH = (usableH - GAP * (rows - 1)) / rows;

  for (let i = 0; i < items.length; i++) {
    const col = i % cols;
    const row = floor(i / cols);

    items[i].x = PAD + col * (tileW + GAP);
    items[i].y = PAD + row * (tileH + GAP);
    items[i].w = tileW;
    items[i].h = tileH;
  }
}

function getHoveredItem(mx, my) {
  for (const it of items) {
    if (mx >= it.x && mx <= it.x + it.w && my >= it.y && my <= it.y + it.h) {
      return it;
    }
  }
  return null;
}

function drawTooltip(it) {
  const lines = [
    it.title,
    it.artist
    // if you want date too, add: it.date
  ];

  textSize(12);
  const padding = 8;

  // measure tooltip size
  let maxW = 0;
  for (const line of lines) maxW = max(maxW, textWidth(line));
  const boxW = maxW + padding * 2;
  const boxH = lines.length * 16 + padding * 2;

  // position near mouse but keep on-screen
  let x = mouseX + 12;
  let y = mouseY + 12;
  if (x + boxW > width) x = width - boxW - 8;
  if (y + boxH > height) y = height - boxH - 8;

  noStroke();
  fill(255, 245);
  rect(x, y, boxW, boxH, 8);

  fill(0, 220);
  let ty = y + padding + 12;
  for (const line of lines) {
    text(line, x + padding, ty);
    ty += 16;
  }
}
