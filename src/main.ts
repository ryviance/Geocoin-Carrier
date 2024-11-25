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
const OAKES_CLASSROOM = leaflet.latLng(36.98952979588401, -122.06275528548504);
let playerLocation = OAKES_CLASSROOM;

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
const playerMarker = leaflet.marker(playerLocation);
playerMarker.bindTooltip("That's you!");
playerMarker.addTo(map);

// Display the player's points
const playerCoins: Coin[] = []; // Array to hold the player's collected coins
const statusPanel = document.querySelector<HTMLDivElement>("#statusPanel")!;
statusPanel.innerHTML = "No coins yet...";

// State preservation using Memento pattern
const cacheStateMemento = new Map<string, { coins: Coin[] }>();

function saveCacheState(i: number, j: number, coins: Coin[]) {
  cacheStateMemento.set(`${i},${j}`, { coins: [...coins] });
}

function loadCacheState(i: number, j: number): { coins: Coin[] } | null {
  return cacheStateMemento.get(`${i},${j}`) || null;
}

// Coin class and global registry
class Coin {
  static nextID = 0;
  coinID: number;
  currentOwner: string | { i: number; j: number };

  constructor(public i: number, public j: number, public serial: number) {
    this.coinID = Coin.nextID++;
    this.currentOwner = { i, j };
  }

  getRepresentation(): string {
    return `${this.i}:${this.j}#${this.serial}`;
  }
}

const globalCoinRegistry = new Map<number, Coin>();

function generateCoin(i: number, j: number, serial: number): Coin {
  const coin = new Coin(i, j, serial);
  globalCoinRegistry.set(coin.coinID, coin);
  return coin;
}

// Add caches dynamically
function spawnCache(i: number, j: number) {
  const state = loadCacheState(i, j);
  const coins = state?.coins || [];

  if (!state) {
    const initialCoinCount = Math.floor(
      luck([i, j, "coinCount"].toString()) * 5,
    );
    for (let k = 0; k < initialCoinCount; k++) {
      coins.push(generateCoin(i, j, k));
    }
    saveCacheState(i, j, coins);
  }

  const bounds = leaflet.latLngBounds([
    [i * TILE_DEGREES, j * TILE_DEGREES],
    [(i + 1) * TILE_DEGREES, (j + 1) * TILE_DEGREES],
  ]);

  const rect = leaflet.rectangle(bounds, { color: "blue", weight: 1 });
  rect.addTo(map);

  rect.bindPopup(() => {
    const popupDiv = document.createElement("div");
    popupDiv.innerHTML = `
      <div>Cache at (${i}, ${j})</div>
      <div>Coins in cache: <span id="cacheCoins">${coins.length}</span></div>
      <ul id="cacheCoinList">
        ${coins.map((coin) => `<li>${coin.getRepresentation()}</li>`).join("")}
      </ul>
      <div>Your coins: <span id="playerPoints">${playerCoins.length}</span></div>
      <ul id="playerCoinList">
        ${
      playerCoins.map((coin) => `<li>${coin.getRepresentation()}</li>`).join("")
    }
      </ul>
      <div style="margin-top: 10px;">
        <select id="collectCoinSelector" style="width: 180px;"></select>
        <button id="collectCoins" style="margin-left: 5px;">Collect Coin</button>
      </div>
      <div style="margin-top: 10px;">
        <select id="depositCoinSelector" style="width: 180px;"></select>
        <button id="depositCoins" style="margin-left: 5px;">Deposit Coin</button>
      </div>
    `;

    setTimeout(() => {
      const collectButton = popupDiv.querySelector("#collectCoins");
      const depositButton = popupDiv.querySelector("#depositCoins");
      const collectSelector = popupDiv.querySelector<HTMLSelectElement>(
        "#collectCoinSelector",
      );
      const depositSelector = popupDiv.querySelector<HTMLSelectElement>(
        "#depositCoinSelector",
      );
      collectButton?.addEventListener("click", () => {
        if (coins.length > 0 && collectSelector?.value) {
          const selectedIndex = parseInt(collectSelector.value, 10);
          const collectedCoin = coins.splice(selectedIndex, 1)[0]; // Remove the selected coin from cache
          if (collectedCoin) {
            playerCoins.push(collectedCoin); // Add it to player's inventory
            saveCacheState(i, j, coins); // Save updated cache state
            updatePopupUI();
            updateStatusPanel(); // Update the status panel
            saveGameState();
          }
        }
      });

      depositButton?.addEventListener("click", () => {
        if (playerCoins.length > 0 && depositSelector?.value) {
          const selectedIndex = parseInt(depositSelector.value, 10);
          const selectedCoin = playerCoins.splice(selectedIndex, 1)[0]; // Remove selected coin from inventory
          coins.push(selectedCoin); // Add the coin to the cache
          saveCacheState(i, j, coins); // Save updated cache state
          updatePopupUI();
          updateStatusPanel(); // Update the status panel
          saveGameState();
        }
      });

      // Update the UI dynamically after changes
      function updatePopupUI() {
        popupDiv.querySelector("#cacheCoins")!.textContent = coins.length
          .toString();
        popupDiv.querySelector("#playerPoints")!.textContent = playerCoins
          .length.toString();

        const cacheCoinList = popupDiv.querySelector("#cacheCoinList")!;
        cacheCoinList.innerHTML = coins
          .map((coin) => `<li>${coin.getRepresentation()}</li>`)
          .join("");

        const playerCoinList = popupDiv.querySelector("#playerCoinList")!;
        playerCoinList.innerHTML = playerCoins
          .map((coin) => `<li>${coin.getRepresentation()}</li>`)
          .join("");

        const collectOptions = popupDiv.querySelector("#collectCoinSelector")!;
        collectOptions.innerHTML = coins
          .map((coin, idx) =>
            `<option value="${idx}">${coin.getRepresentation()}</option>`
          )
          .join("");

        const depositOptions = popupDiv.querySelector("#depositCoinSelector")!;
        depositOptions.innerHTML = playerCoins
          .map((coin, idx) =>
            `<option value="${idx}">${coin.getRepresentation()}</option>`
          )
          .join("");
      }

      updatePopupUI(); // Initial UI update
    });

    return popupDiv;
  });
}

// Status Panel
function updateStatusPanel() {
  const statusPanel = document.getElementById("statusPanel");
  if (statusPanel) {
    if (playerCoins.length === 0) {
      statusPanel.innerHTML = "No coins yet...";
    } else {
      statusPanel.innerHTML = `You have ${playerCoins.length} coin(s).`;
    }
  }
}

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

function refreshNeighborhood() {
  map.eachLayer((layer) => {
    if (layer instanceof leaflet.Rectangle) map.removeLayer(layer);
  });

  const centerCell = cellFactory.getCell(
    playerLocation.lat,
    playerLocation.lng,
  );

  for (let di = -NEIGHBORHOOD_SIZE; di <= NEIGHBORHOOD_SIZE; di++) {
    for (let dj = -NEIGHBORHOOD_SIZE; dj <= NEIGHBORHOOD_SIZE; dj++) {
      const cell = { i: centerCell.i + di, j: centerCell.j + dj };
      if (luck([cell.i, cell.j].toString()) < CACHE_SPAWN_PROBABILITY) {
        spawnCache(cell.i, cell.j);
      }
    }
  }
}

// Create a polyline to track movement history
const movementHistory: [number, number][] = [];
const movementPolyline = leaflet.polyline([], { color: "blue" }).addTo(map);

function movePlayer(direction: "north" | "south" | "east" | "west") {
  switch (direction) {
    case "north":
      playerLocation = leaflet.latLng(
        playerLocation.lat + TILE_DEGREES,
        playerLocation.lng,
      );
      break;
    case "south":
      playerLocation = leaflet.latLng(
        playerLocation.lat - TILE_DEGREES,
        playerLocation.lng,
      );
      break;
    case "east":
      playerLocation = leaflet.latLng(
        playerLocation.lat,
        playerLocation.lng + TILE_DEGREES,
      );
      break;
    case "west":
      playerLocation = leaflet.latLng(
        playerLocation.lat,
        playerLocation.lng - TILE_DEGREES,
      );
      break;
  }

  // Update movement history
  movementHistory.push([playerLocation.lat, playerLocation.lng]);
  movementPolyline.setLatLngs(movementHistory); // Update the polyline on the map

  refreshNeighborhood(); // Refresh the neighborhood (existing functionality)
  playerMarker.setLatLng(playerLocation); // Update the player marker on the map
  saveGameState();
}

// Setup button listeners
document.querySelector("#north")?.addEventListener(
  "click",
  () => movePlayer("north"),
);
document.querySelector("#south")?.addEventListener(
  "click",
  () => movePlayer("south"),
);
document.querySelector("#east")?.addEventListener(
  "click",
  () => movePlayer("east"),
);
document.querySelector("#west")?.addEventListener(
  "click",
  () => movePlayer("west"),
);

// Initialize neighborhood
refreshNeighborhood();

// Variable to manage geolocation tracking
let isTrackingLocation = false;
let watchId: number | null = null;

// Get the 🌐 button from the DOM (inside the control panel)
const globeButton = document.getElementById("sensor") as HTMLButtonElement;

// Check if the button exists
if (!globeButton) {
  console.error("Geolocation button not found.");
} else {
  // You can style the button here if needed, or let the CSS handle it
  globeButton.style.position = "relative"; // Example styling if needed

  // Handle geolocation toggle
  globeButton.addEventListener("click", () => {
    if (isTrackingLocation) {
      // Stop tracking
      if (watchId !== null) {
        navigator.geolocation.clearWatch(watchId);
        watchId = null;
      }
      isTrackingLocation = false;
      globeButton.style.backgroundColor = ""; // Reset button style
      alert("Geolocation tracking disabled.");
    } else {
      // Start tracking
      if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser.");
        return;
      }

      isTrackingLocation = true;
      globeButton.style.backgroundColor = "lightgreen"; // Highlight button
      alert("Geolocation tracking enabled.");

      watchId = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          const newLocation = leaflet.latLng(latitude, longitude);

          // Update player location and refresh the neighborhood
          playerLocation = newLocation;
          playerMarker.setLatLng(playerLocation);
          refreshNeighborhood();
        },
        (error) => {
          console.error("Geolocation error:", error);
          alert("Failed to get geolocation. Check permissions and try again.");
        },
        {
          enableHighAccuracy: true, // Use high accuracy if available
          maximumAge: 1000, // Accept cached positions up to 1 second old
          timeout: 10000, // Timeout after 10 seconds if no position is obtained
        },
      );
    }
  });
}

// Get the 📍 button from the DOM (inside the control panel)
const centerButton = document.getElementById("center") as HTMLButtonElement;

// Check if the button exists
if (!centerButton) {
  console.error("Center button not found.");
} else {
  // Handle center-on-player functionality
  centerButton.addEventListener("click", () => {
    if (!playerLocation) {
      alert(
        "Player location is not available. Make sure geolocation is enabled.",
      );
      return;
    }

    // Center the map on the player's location
    map.setView(playerLocation, map.getZoom());
  });
}

// Save the game state to localStorage
function saveGameState() {
  const gameState = {
    playerLocation: { lat: playerLocation.lat, lng: playerLocation.lng },
    playerCoins: playerCoins.map((coin) => ({
      coinID: coin.coinID,
      i: coin.i,
      j: coin.j,
      serial: coin.serial,
    })),
    cacheStates: Array.from(cacheStateMemento.entries()).map(
      ([key, state]) => ({
        key,
        coins: state.coins.map((coin) => ({
          coinID: coin.coinID,
          i: coin.i,
          j: coin.j,
          serial: coin.serial,
        })),
      }),
    ),
    movementHistory: movementHistory, // Save the movement history (polyline)
  };

  localStorage.setItem("gameState", JSON.stringify(gameState));
}

interface Coin {
  coinID: number;
  i: number;
  j: number;
  serial: number;
}

interface CacheState {
  key: string;
  coins: Coin[];
}

// Load the game state from localStorage
function loadGameState() {
  const gameStateString = localStorage.getItem("gameState");
  if (gameStateString) {
    const gameState = JSON.parse(gameStateString);

    // Restore player location
    playerLocation = leaflet.latLng(
      gameState.playerLocation.lat,
      gameState.playerLocation.lng,
    );
    playerMarker.setLatLng(playerLocation);

    // Restore player coins
    playerCoins.length = 0; // Clear current player coins
    gameState.playerCoins.forEach((coinData: Coin) => {
      const coin = generateCoin(
        coinData.i,
        coinData.j,
        coinData.serial,
      );
      coin.coinID = coinData.coinID; // Restore coin ID
      playerCoins.push(coin);
    });

    // Restore cache states
    cacheStateMemento.clear(); // Clear existing cache states
    gameState.cacheStates.forEach((cacheState: CacheState) => {
      const coins = cacheState.coins.map((coinData: Coin) => {
        const coin = generateCoin(
          coinData.i,
          coinData.j,
          coinData.serial,
        );
        coin.coinID = coinData.coinID; // Restore coin ID
        return coin;
      });
      cacheStateMemento.set(cacheState.key, { coins });
    });

    // Restore movement history (polyline)
    movementHistory.length = 0; // Clear current movement history
    movementHistory.push(...gameState.movementHistory);
    movementPolyline.setLatLngs(movementHistory); // Update the polyline with restored movement history

    // Refresh the neighborhood to restore cache UI
    refreshNeighborhood();

    // Update the status panel
    updateStatusPanel();
  }
}

// Call loadGameState on page load
loadGameState();

document.querySelector("#reset")?.addEventListener("click", () => {
  // Clear storage
  localStorage.clear();

  // Reset player state
  playerLocation = OAKES_CLASSROOM;
  playerMarker.setLatLng(playerLocation);

  // Clear movement history
  movementHistory.length = 0;
  movementPolyline.setLatLngs(movementHistory);

  // Reset player coins
  playerCoins.length = 0;

  // Clear caches
  cacheStateMemento.clear();

  // Refresh neighborhood
  refreshNeighborhood();
  updateStatusPanel();

  alert("Game reset successfully!");
});
