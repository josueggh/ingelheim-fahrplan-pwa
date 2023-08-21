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


exports.fahrplan = onRequest(async (request, response) => {
  logger.info("Retrieving RMV data", {structuredData: true});

  response.set('Access-Control-Allow-Origin', 'https://ingelheim-fahrplan.web.app');

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
      const url = `https://www.rmv.de/auskunft/bin/jp/stboard.exe/dn?L=vs_anzeigetafel&cfgfile=FreiWeinhe_4001657_133772753&dataOnly=true&start=1&maxJourneys=20&wb=COOL&time=${timeString}`;

      logger.info("Retrieving data from", url);

      const headers = {
        "sec-ch-ua": "\"Not.A/Brand\";v=\"8\", \"Chromium\";v=\"114\", \"Google Chrome\";v=\"114\"",
        "Referer": "",
        "sec-ch-ua-mobile": "?1",
        "User-Agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Mobile Safari/537.36",
      };

      const rmvResponse = await axios.get(url, {
        headers: headers,
      });

      logger.info("Sending response");
      response.send(rmvResponse.data);

    } catch (error) {
      logger.error(error);
      response.send({});
    }
  }
});

