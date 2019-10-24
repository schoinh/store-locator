var maxClusterZoomLevel = 11;
var storeLocationDataUrl = 'data/ContosoCoffee.txt';
var iconImageUrl = 'images/CoffeeIcon.png';
var map, popup, datasource, iconLayer, centerMarker, searchURL;

function initialize() {
  map = new atlas.Map('myMap', {
    center: [-90, 40],
    zoom: 2,
    authOptions: {
      authType: 'subscriptionKey',
      subscriptionKey: apiKey
    }
  });

  popup = new atlas.Popup();

  const subscriptionKeyCredential = new atlas.service.SubscriptionKeyCredential(atlas.getSubscriptionKey());
  const pipeline = atlas.service.MapsURL.newPipeline(subscriptionKeyCredential, {
    retryOptions: { maxtries: 4 }
  });
  searchURL = new atlas.service.SearchURL(pipeline);

  document.getElementById('searchBtn').onclick = performSearch;
  document.getElementById('searchTbx').onkeyup = function (e) {
    if (e.keyCode === 13) {
      performSearch();
    }
  };
  document.getElementById('myLocationBtn').onclick = setMapToUserLocation;

  map.events.add('ready', function () {
    map.controls.add(new atlas.control.ZoomControl(), {
      position: 'top-right'
    });

    centerMarker = new atlas.HtmlMarker({
      htmlContent: '<div class="mapCenterIcon"></div>',
      position: map.getCamera().center
    });
    map.markers.add(centerMarker);

    datasource = new atlas.source.DataSource(null, {
      cluster: true,
      clusterMaxZoom: maxClusterZoomLevel - 1
    });
    map.sources.add(datasource);
    loadStoreData();

    var clusterBubbleLayer = new atlas.layer.BubbleLayer(datasource, null, {
      radius: 12,
      color: '#007faa',
      strokeColor: 'white',
      strokeWidth: 2,
      filter: ['has', 'point_count']
    });
    var clusterLabelLayer = new atlas.layer.SymbolLayer(datasource, null, {
      iconOptions: {
        image: 'none'
      },

      textOptions: {
        textField: ['get', 'point_count_abbreviated'],
        size: 12,
        font: ['StandardFont-Bold'],
        offset: [0, 0.4],
        color: 'white'
      }
    });
    map.layers.add([clusterBubbleLayer, clusterLabelLayer]);

    map.imageSprite.add('myCustomIcon', iconImageUrl).then(function () {
      iconLayer = new atlas.layer.SymbolLayer(datasource, null, {
        iconOptions: {
          image: 'myCustomIcon',
          font: ['SegoeUi-Bold'],
          anchor: 'center',
          allowOverlap: true
        },
        filter: ['!', ['has', 'point_count']]
      });
    });
    map.layers.add(iconLayer);

    map.events.add('mouseover', [clusterBubbleLayer, iconLayer], function () {
      map.getCanvasContainer().style.cursor = 'pointer';
    });

    map.events.add('mouseout', [clusterBubbleLayer, iconLayer], function () {
      map.getCanvasContainer().style.cursor = 'grab';
    });

    map.events.add('click', clusterBubbleLayer, function (e) {
      map.setCamera({
        center: e.position,
        zoom: map.getCamera().zoom + 2
      });
    });

    map.events.add('click', iconLayer, function (e) {
      showPopup(e.shapes[0]);
    });

    map.events.add('render', function () {
      updateListItems();
    })
  })
};

var countrySet = ['US', 'CA', 'GB', 'FR', 'DE', 'IT', 'ES', 'NL', 'DK'];

function performSearch() {
  var query = document.getElementById('searchTbx').value;

  searchURL.searchFuzzy(atlas.service.Aborter.timeout(3000), query, {
    countrySet: countrySet
  }).then(results => {
    var data = results.geojson.getFeatures();
    if (data.features.length > 0) {
      map.setCamera({
        bounds: data.features[0].bbox,
        padding: 40
      });
    } else {
      document.getElementById('listPanel').innerHTML = '<div class="statusMessage">Unable to find the location you searched for.</div>';
    }
  });
};

function setMapToUserLocation() {
  navigator.geolocation.getCurrentPosition(function (position) {
    map.setCamera({
      center: [position.coords.longitude, position.coords.latitude],
      zoom: maxClusterZoomLevel + 1
    });
  }, function (error) {
    switch (error.code) {
      case error.PERMISSION_DENIED:
        alert('User denied the request for geolocation');
        break;
      case error.POSITION_UNAVAILABLE:
        alert('Position info unavailable');
        break;
      case error.TIMEOUT:
        alert('Request timed out');
        break;
      case error.UNKNOWN_ERROR:
        alert('Unknown error');
        break;
    }
  });
};

function loadStoreData() {
  fetch(storeLocationDataUrl, { mode: 'no-cors' })
    .then(response => response.text())
    .then(function (text) {
      var features = [];
      var lines = text.split('\n');
      var row = lines[0].split('\t');

      var header = {};
      var numColumns = row.length;
      for (var i = 0; i < row.length; i++) {
        header[row[i]] = i;
      };

      for (var i = 1; i < lines.length; i++) {
        row = lines[i].split('\t');
        if (row.length >= numColumns) {
          features.push(new atlas.data.Feature(new atlas.data.Point([parseFloat(row[header['Longitude']]), parseFloat(row[header['Latitude']])]), {
            AddressLine: row[header['AddressLine']],
            City: row[header['City']],
            Municipality: row[header['Municipality']],
            AdminDivision: row[header['AdminDivision']],
            Country: row[header['Country']],
            PostCode: row[header['PostCode']],
            Phone: row[header['Phone']],
            StoreType: row[header['StoreType']],
            IsWiFiHotSpot: (row[header['IsWiFiHotSpot']].toLowerCase() === 'true') ? true : false,
            IsWheelchairAccessible: (row[header['IsWheelchairAccessible']].toLowerCase() === 'true') ? true : false,
            Opens: parseInt(row[header['Opens']]),
            Closes: parseInt(row[header['Closes']])
          }));
        };
      };

      datasource.add(new atlas.data.FeatureCollection(features));
      updateListItems();
    });
};

var listItemTemplate = `
<div class="listItem" onclick="itemSelected(\'{id}\')">
  <div class="listItem-title">{title}</div>
  {city}<br/>
  Open until {closes}<br/>
  {distance} miles away
</div>`;

function updateListItems() {
  centerMarker.setOptions({
    visible: false
  });

  var camera = map.getCamera();
  var listPanel = document.getElementById('listPanel');

  if (camera.zoom < maxClusterZoomLevel) {
    popup.close();
    listPanel.innerHTML = '<div class="statusMessage">Search for a location, zoom in, or select My Location button to see individual store locations.</div>';
  } else {
    centerMarker.setOptions({
      position: camera.center,
      visible: true
    });

    var html = [], properties;
    var data = map.layers.getRenderedShapes(map.getCamera().bounds, [iconLayer]);
    var distances = {};

    data.forEach(function (shape) {
      if (shape instanceof atlas.Shape) {
        distances[shape.getId()] = Math.round(atlas.math.getDistanceTo(camera.center, shape.getCoordinates(), 'miles') * 100) / 100;
      }
    });

    data.sort(function (x, y) {
      return distances[x.getId()] - distances[y.getId()];
    });

    data.forEach(function (shape) {
      properties = shape.getProperties();

    })
  }
}

window.onload = initialize;