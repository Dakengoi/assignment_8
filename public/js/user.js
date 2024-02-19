let infoWindow;

async function initMap() {
  const { Map } = await google.maps.importLibrary("maps");
  const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

  const urlParams = new URLSearchParams(window.location.search);
  const lat = parseFloat(urlParams.get("lat")) || 51.091038062713075;
  const lng = parseFloat(urlParams.get("lon")) || 71.41834363215015;

  const position = { lat, lng };

  map = new Map(document.getElementById("map"), {
    center: position,
    zoom: 15,
    mapId: "4504f8b37365c3d0",
  });

  // Create an initial marker based on URL parameters
  const initialMarker = new AdvancedMarkerElement({
    map,
    position,
    title: "Hello, world!",
  });

  // Set up an info window
  infoWindow = new google.maps.InfoWindow({
    content: "Click the map to get Lat/Lng!",
    position,
    
  });

  // Configure the click listener.
  map.addListener("click", async (mapsMouseEvent) => {
    const { AdvancedMarkerElement } = await google.maps.importLibrary("marker");

    // Create a new marker at the clicked position
    const marker = new AdvancedMarkerElement({
      map,
      position: mapsMouseEvent.latLng,
      title: "Hello, world!",
    });

    // Update the info window content with JSON formatted coordinates
    infoWindow.setContent(
      JSON.stringify({
        lat: mapsMouseEvent.latLng.lat(),
        lng: mapsMouseEvent.latLng.lng(),
      })
    );

    // Update the info window position
    infoWindow.setPosition(mapsMouseEvent.latLng);
    infoWindow.open(map);
  });
}

window.initMap = initMap;
initMap();