// Import Leaflet and styles
// @deno-types="npm:@types/leaflet@^1.9.14"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./leafletWorkaround.ts";
import luck from "./luck.ts";

// Gameplay settings and constants
const TILE_DEGREES = 1e-4; // Size of each grid cell in lat/lng
const GAMEPLAY_ZOOM_LEVEL = 19;
const NEIGHBORHOOD_SIZE = 8; // Radius of the neighborhood in grid cells
const CACHE_SPAWN_PROBABILITY = 0.1;

// Starting location (Oakes College classroom)
const OAKES_CLASSROOM = leaflet.latLng(36.98949379578401, -122.06277128548504);

// Initialize map
const map = leaflet.map(document.getElementById("map")!, {
  center: OAKES_CLASSROOM,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

// Add a tile layer to the map
leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution:
      '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  })
  .addTo(map);

// Add a player marker
const playerMarker = leaflet.marker(OAKES_CLASSROOM);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
let playerPoints = 0;
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No coins yet...";

// Flyweight pattern to manage cells
const cellFactory = (() => {
  const cellCache = new Map<string, { i: number; j: number }>();

  return {
    getCell(lat: number, lng: number) {
      const i = Math.floor(lat / TILE_DEGREES);
      const j = Math.floor(lng / TILE_DEGREES);
      const key = `${i},${j}`;

      if (!cellCache.has(key)) {
        cellCache.set(key, { i, j });
      }
      return cellCache.get(key)!;
    },
  };
})();

// Coin factory with global tracking
class Coin {
  static nextID = 0; // Global counter for unique IDs
  coinID: number; // Unique ID
  currentOwner: string | { i: number; j: number }; // Player or cache location

  constructor(
    public i: number,
    public j: number,
    public serial: number
  ) {
    this.coinID = Coin.nextID++;
    this.currentOwner = { i, j }; // Initial cache location
  }

  // Compact representation for the user
  getRepresentation(): string {
    return `${this.i}:${this.j}#${this.serial}`;
  }
}

// Global registry of all coins
const globalCoinRegistry = new Map<number, Coin>();

function generateCoin(i: number, j: number, serial: number): Coin {
  const coin = new Coin(i, j, serial);
  globalCoinRegistry.set(coin.coinID, coin); // Add to global registry
  return coin;
}

// Add caches to the map by cell numbers
function spawnCache(i: number, j: number) {
  // Calculate bounds of the grid cell
  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  // Each cache starts with a random number of coins
  const coins: Coin[] = [];
  const initialCoinCount =
    Math.floor(luck([i, j, "coinCount"].toString()) * 5) + 1; // Random 1-5 coins
  for (let k = 0; k < initialCoinCount; k++) {
    const coin = generateCoin(i, j, k);
    coins.push(coin);
  }

  // Add a rectangle to represent the cache
  const rect = leaflet.rectangle(bounds, { color: "blue", weight: 1 });
  rect.addTo(map);

  // Handle cache interactions
  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache at (${i}, ${j})</div>
      <div>Coins in cache: <span id="cacheCoins">${coins.length}</span></div>
      <div>Your coins: <span id="playerCoins">${playerPoints}</span></div>
      <ul id="coinList">
        ${
          coins
            .map((coin) => `<li>${coin.getRepresentation()}</li>`)
            .join("")
        }
      </ul>
      <button id="collect">Collect</button>
      <button id="deposit">Deposit</button>
    `;

    // Collect button functionality
    popupDiv
      .querySelector<HTMLButtonElement>("#collect")!
      .addEventListener("click", () => {
        if (coins.length > 0) {
          const collectedCoin = coins.pop()!;
          collectedCoin.currentOwner = "player"; // Update ownership
          playerPoints++;
          popupDiv.querySelector<HTMLSpanElement>("#cacheCoins")!
            .textContent = coins.length.toString();
          popupDiv.querySelector<HTMLSpanElement>("#playerCoins")!
            .textContent = playerPoints.toString();
          popupDiv.querySelector<HTMLUListElement>("#coinList")!.innerHTML =
            coins
              .map((coin) => `<li>${coin.getRepresentation()}</li>`)
              .join("");
          statusPanel.innerHTML = `${playerPoints} coins accumulated.`;
        } else {
          alert("No more coins to collect!");
        }
      });

    // Deposit button functionality
    popupDiv
      .querySelector<HTMLButtonElement>("#deposit")!
      .addEventListener("click", () => {
        if (playerPoints > 0) {
          const depositedCoin = [...globalCoinRegistry.values()].find(
            (coin) => coin.currentOwner === "player"
          );
          if (depositedCoin) {
            depositedCoin.currentOwner = { i, j }; // Update ownership
            coins.push(depositedCoin);
            playerPoints--;
            popupDiv.querySelector<HTMLSpanElement>("#cacheCoins")!
              .textContent = coins.length.toString();
            popupDiv.querySelector<HTMLSpanElement>("#playerCoins")!
              .textContent = playerPoints.toString();
            popupDiv.querySelector<HTMLUListElement>("#coinList")!.innerHTML =
              coins
                .map((coin) => `<li>${coin.getRepresentation()}</li>`)
                .join("");
            statusPanel.innerHTML = `${playerPoints} coins accumulated.`;
          }
        } else {
          alert("You don't have any coins to deposit!");
        }
      });

    return popupDiv;
  });
}

// Generate caches in the player's neighborhood
for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
  for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
    const lat = OAKES_CLASSROOM.lat + di * TILE_DEGREES;
    const lng = OAKES_CLASSROOM.lng + dj * TILE_DEGREES;

    // Determine whether to spawn a cache
    const cell = cellFactory.getCell(lat, lng);
    if (luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnCache(cell.i, cell.j);
    }
  }
}