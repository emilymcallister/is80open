var fetch = require('node-fetch');

module.exports = function handler(req, res) {
  var results = {};

  return fetchGoogle()
    .then(function () {
      return fetchCaltrans();
    })
    .then(function () {
      return fetchCaltransPost();
    })
    .then(function () {
      res.status(200).json({
        message: 'Connectivity test results',
        timestamp: new Date().toISOString(),
        results: results,
      });
    })
    .catch(function (err) {
      res.status(200).json({
        message: 'Test failed',
        error: err.message,
        results: results,
      });
    });

  function fetchGoogle() {
    return fetch('https://www.google.com', { timeout: 10000 })
      .then(function (r) {
        results.google = { status: r.status, ok: r.ok };
      })
      .catch(function (e) {
        results.google = { error: e.message };
      });
  }

  function fetchCaltrans() {
    return fetch(
      'https://roads.dot.ca.gov/roadscell.php?roadnumber=80',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        },
        timeout: 15000,
      }
    )
      .then(function (r) {
        return r.text().then(function (text) {
          results.caltransMain = {
            status: r.status,
            length: text.length,
            first800: text.substring(0, 800),
          };
        });
      })
      .catch(function (e) {
        results.caltransMain = { error: e.message };
      });
  }

  function fetchCaltransPost() {
    return fetch('https://roads.dot.ca.gov/roadscell.php', {
      method: 'POST',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Content-Type': 'application/x-www-form-urlencoded',
        Referer: 'https://roads.dot.ca.gov/',
      },
      body: 'roadnumber=80&submit=Search',
      timeout: 15000,
    })
      .then(function (r) {
        return r.text().then(function (text) {
          results.caltransPost = {
            status: r.status,
            length: text.length,
            first800: text.substring(0, 800),
          };
        });
      })
      .catch(function (e) {
        results.caltransPost = { error: e.message };
      });
  }
};
