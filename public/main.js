(() => {
  let globalJourneys = {};

  function displayCurrentHour() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');

    const timeString = `${hours}:${minutes}`;
    document.getElementById('time').innerText = timeString;
  }

  function getTime(journey) {
    return journey.rtInfo && journey.rtInfo.progTime ? journey.rtInfo.progTime : "-";
  }

  function extraInfo(journey) {
    if (journey.status === "delayed") {
      return `<h4>${journey.time} +${journey.delay}"</h4>`
    }

    if (journey.status === "cancelled") {
      return `<h4>ausgefallen</h4>`
    }
    return "";
  }


  async function fetchDataAndBuildTable() {
    displayCurrentHour();
    try {
      document.getElementById('loading').style.display = "block";
      document.getElementById('table-container').style.display = "none";
      // const response = await fetch('http://127.0.0.1:5001/ingelheim-fahrplan/us-central1/fahrplan');
      const response = await fetch('https://fahrplan-ics4sb2gxa-uc.a.run.app/');
      const journeys = await response.json();

      if (journeys) {
        globalJourneys = journeys;
        buildTable();
        document.getElementById('loading').style.display = "none";
        document.getElementById('table-container').style.display = "block";
      } else {
        console.error('Invalid data format');
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  }


  function buildTable() {
    const currentFilter = localStorage.getItem('filter');
    document.getElementById(`filter-${currentFilter}`).classList.add("selected")
    const journeys = currentFilter === "all" ? globalJourneys : globalJourneys.filter(journey => journey.type === currentFilter);

    const tableContainer = document.getElementById('table-container');
    let tableHTML = '';

    for (let journey of journeys) {
      tableHTML += `
  <div class="card card-${journey.status}">
    <div class="time">
      <h2>${journey.expectedTime}</h2>
      ${extraInfo(journey)}
    </div>
    <div class="info">
      <h2>${journey.route}</h2>
      <h3>nach ${journey.destination}</h3>
    </div>
    <div class="gleis">
      <small>Gleis<br></small>${journey.gate ?? ""}
    </div>
  </div>
`;
    }
    tableContainer.innerHTML = tableHTML;
  }

  function setTheme() {
    const storedTheme = localStorage.getItem('theme');
    if (storedTheme) {
      if (storedTheme === 'dark') {
        document.body.classList.add('dark-mode');
      } else {
        document.body.classList.remove('dark-mode');
      }
    } else {
      if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.body.classList.add('dark-mode');
        localStorage.setItem("theme", "dark");
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#05171f');

      } else {
        document.body.classList.remove('dark-mode');
        localStorage.setItem("theme", "light");
        document.querySelector('meta[name="theme-color"]').setAttribute('content', '#FFFFFF');
      }
    }
  }

  function setFilter() {
    if (!localStorage.getItem('filter')) {
      localStorage.setItem("filter", "all");
      document.getElementById("filter-all").classList.add("selected")
    }
  }


  window.addEventListener('DOMContentLoaded', (event) => {
    setTheme();
    setFilter();
    fetchDataAndBuildTable();
    setInterval(() => fetchDataAndBuildTable(), 60000);

    document.getElementById("change-color").addEventListener("click", () => {
      const storedTheme = localStorage.getItem('theme');

      if (storedTheme === "dark") {
        localStorage.setItem("theme", "light");
      } else {
        localStorage.setItem("theme", "dark");
      }
      setTheme();
    });

    const filtersContainer = document.querySelector('.filters');

    filtersContainer.addEventListener('click', function (event) {
      if (event.target.tagName === 'BUTTON') {
        const previouslySelected = filtersContainer.querySelector('.selected');
        if (previouslySelected) {
          previouslySelected.classList.remove('selected');
        }
        event.target.classList.add('selected');

        const selectedFilter = event.target.getAttribute('data-filter');
        localStorage.setItem("filter", selectedFilter);
        buildTable()
      }
    });

  });

})()
