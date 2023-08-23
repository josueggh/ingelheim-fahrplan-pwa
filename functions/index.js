/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

const {onRequest} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");
const axios = require("axios");
const cheerio = require('cheerio');

const transformRMV = (input) => {
  const cleanedJSON = input.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']');
  const data = JSON.parse(cleanedJSON);

  return data.journey.filter(j => j.rtInfo.status !=="NONE").map(j => {
    const time = j.time;
    const gate = j.track.platform;
    const route = j.mot.name;
    const destination = j.direction.replace("Hauptbahnhof","Hbf");
    let status;
    let expectedTime;
    let delay = 0;

    switch (j.rtInfo.status) {
      case "DELAYED":
        status = "delayed";
        delay = j.rtInfo.progDelay;
        expectedTime = `${j.rtInfo.progTime}`;
        break;
      case "FAILURE":
        status = "cancelled";
        expectedTime = `${j.time}`;
        break;
      case "ONTIME":
        status = "on-time";
        expectedTime = `${j.rtInfo.progTime}`;
        break;
      default:
        status = j.rtInfo.status.toLowerCase();
        expectedTime = `${j.rtInfo.time}`;
    }

    return {
      time: time,
      gate: gate,
      status: status,
      delay: delay,
      expectedTime: expectedTime,
      route: route,
      destination: destination,
      type: route.toLowerCase().includes("bus") ? "bus" : "train"
    };
  });
};

const calculateTime = (timeStr, minutesToAdd) => {
  if(!minutesToAdd ){
    return timeStr;
  }
  // Split the time string into hours and minutes
  const timeParts = timeStr.split(":");
  let hours = parseInt(timeParts[0], 10);
  let minutes = parseInt(timeParts[1], 10) + minutesToAdd;

  // Calculate new hours and minutes
  while (minutes >= 60) {
    hours += 1;
    minutes -= 60;
  }

  while (minutes < 0) {
    hours -= 1;
    minutes += 60;
  }

  // Adjust for overflows beyond 24 hours or underflows
  hours = hours % 24;
  if (hours < 0) {
    hours += 24; // handle cases where subtraction might take the time below 00:00
  }

  // Convert hours and minutes back to string format, ensuring two digits
  const hoursStr = hours.toString().padStart(2, '0');
  const minutesStr = minutes.toString().padStart(2, '0');

  return `${hoursStr}:${minutesStr}`;
};


const transformRNN = (input) => {
  return input.filter(element => element.route.toLowerCase().includes("bus")).map(j => {
    const possibleDelay = + j.status.split('+')[1];

    const timeParts = j.time.split(' ');
    const time = (timeParts[1].toLowerCase() === 'pm' ? (parseInt(timeParts[0].split(':')[0], 10) + 12) + ':' + timeParts[0].split(':')[1] : timeParts[0]);
    const route = j.route;
    const destination = j.direction.replace("Hauptbahnhof","Hbf");
    const status = j.status === "cancelled" ? "cancelled" : possibleDelay > 0 ? "delayed" : "on-time";
    const expectedTime = status === "cancelled" ? time : calculateTime(time, possibleDelay);

    return {
      time: time,
      gate: 'A-E',
      status: status,
      delay: possibleDelay,
      expectedTime: expectedTime,
      route: route,
      destination: destination,
      type:"bus"
    };
  });
};


exports.fahrplan = onRequest(async (request, response) => {
  logger.info("Retrieving RMV data", {structuredData: true});

  // response.set('Access-Control-Allow-Origin', 'https://ingelheim-fahrplan.web.app');
  response.set('Access-Control-Allow-Origin', 'http://localhost:5002');

  if (request.method === 'OPTIONS') {
    response.set('Access-Control-Allow-Methods', 'GET');
    response.set('Access-Control-Allow-Headers', 'Content-Type');
    response.set('Access-Control-Max-Age', '3600');
    response.status(204).send('');
  }else {

    try {
      const nowInGermany = new Date().toLocaleString("en-US", { timeZone: "Europe/Berlin" });
      const dateInGermany = new Date(nowInGermany);
      const hours = String(dateInGermany.getHours()).padStart(2, '0');
      const minutes = String(dateInGermany.getMinutes()).padStart(2, '0');

      const timeString = `${hours}:${minutes}:00`;
      const RMV_URL = `https://www.rmv.de/auskunft/bin/jp/stboard.exe/dn?L=vs_anzeigetafel&cfgfile=FreiWeinhe_4001657_133772753&dataOnly=true&start=1&maxJourneys=20&wb=COOL&time=${timeString}`;
      const RNN_URL = `https://mandanten.vrn.de/rnn2/XSLT_DM_REQUEST?std3_mapDMMacro=true&language=en&name_dm=6008192&type_dm=stopID&itdLPxx_template=tooltip&useRealtime=1&itdLPxx_timeFormat=12`;

      logger.info("✌️ Retrieving data from", RMV_URL);
      logger.info("⭐️️ Retrieving data from", RNN_URL);

      const headers = {
        "sec-ch-ua": "\"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"114\", \"Google Chrome\";v=\"114\"",
        "Referer": "",
        "sec-ch-ua-mobile": "?1",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
      };

      const rnnResponse = await axios.get(RNN_URL);
      const $ = cheerio.load(rnnResponse.data);

      let journeys = [];

      $('tr.std3_departure-line').each((index, row) => {
        let time = $(row).find('td.std3_dmTooltipTime').text().trim();
        let route = $(row).find('span.std3_mot-label').text().trim();
        let status = $(row).find('span.std3_realtime-column').text().trim();
        let direction = $(row).find('td').last().text().trim();

        journeys.push({ time: time, route: route, status: status, direction: direction });
      });

      const rmvResponse = await axios.get(RMV_URL, {headers: headers,});

      logger.info("👷 Building response");
      logger.info(rmvResponse.data);
      const rmvOutput = transformRMV(rmvResponse.data);
      const rnnOutput = transformRNN(journeys);

      const combinedResponses = [...rmvOutput, ...rnnOutput];
      logger.info("🪧 Sorting");

      const finalResponse = combinedResponses.sort((a, b) => {
        if (a.time === null) return 1;
        if (b.time === null) return -1;
        return a.time.localeCompare(b.time);
      });
      response.send(JSON.stringify(finalResponse));

    } catch (error) {
      logger.error(error);
      response.send({});
    }
  }
});

