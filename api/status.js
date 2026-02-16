var fetch = require('node-fetch');

function stripHTML(html) {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function fetchCaltransData() {
  return fetch('https://roads.dot.ca.gov/roadscell.php?roadnumber=80', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      Referer: 'https://roads.dot.ca.gov/',
    },
    timeout: 15000,
    redirect: 'follow',
  })
    .then(function (response) {
      console.log('Caltrans GET status:', response.status);
      return response.text();
    })
    .then(function (html) {
      console.log('Caltrans GET length:', html.length);
      if (html.length > 200) {
        return html;
      }
      return null;
    })
    .catch(function (error) {
      console.error('Caltrans GET error:', error.message);
      return null;
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
      Origin: 'https://roads.dot.ca.gov',
    },
    body: 'roadnumber=80&submit=Search',
    timeout: 15000,
  })
    .then(function (response) {
      console.log('Caltrans POST status:', response.status);
      return response.text();
    })
    .then(function (html) {
      console.log('Caltrans POST length:', html.length);
      if (html.length > 200) {
        return html;
      }
      return null;
    })
    .catch(function (error) {
      console.error('Caltrans POST error:', error.message);
      return null;
    });
}

function analyzeText(text) {
  var upper = text.toUpperCase();
  var closureScore = 0;
  var restrictionScore = 0;
  var openScore = 0;

  // ============================================
  // KEY DISTINCTION:
  // "closed to tractor-semitrailer" = RESTRICTION (yellow)
  // "closed to ALL traffic" in BOTH directions = CLOSED (red)
  // ============================================

  // First: detect closures that are ONLY for trucks/semis
  // These are RESTRICTIONS, not full closures
  var truckOnlyClosures = 0;
  var truckClosurePattern = /CLOSED\s+(?:EASTBOUND\s+|WESTBOUND\s+)?(?:TO\s+)?ALL\s+TRACTOR[\s-]*SEMI[\s-]*TRAILER/gi;
  var truckMatches = upper.match(truckClosurePattern);
  if (truckMatches) {
    truckOnlyClosures = truckMatches.length;
    console.log('Truck-only closures found:', truckOnlyClosures);
  }

  // Also catch "closed to trucks" patterns
  var truckClosurePattern2 = /CLOSED\s+(?:TO\s+)?(?:ALL\s+)?TRUCKS/gi;
  var truckMatches2 = upper.match(truckClosurePattern2);
  if (truckMatches2) {
    truckOnlyClosures += truckMatches2.length;
    console.log('Truck closures (pattern 2):', truckMatches2.length);
  }

  // Detect FULL closures to ALL traffic (not just trucks)
  // These patterns indicate the road is closed to everyone
  var fullClosureEastbound = false;
  var fullClosureWestbound = false;

  // "Is closed to eastbound traffic" (without "tractor" or "truck" nearby)
  var eastClosedMatches = upper.match(/(?:IS\s+)?CLOSED\s+(?:TO\s+)?EASTBOUND\s+TRAFFIC/gi);
  if (eastClosedMatches) {
    // Check if this is near "tractor-semitrailer" — if so, it's truck-only
    var eastContext = '';
    var eastIdx = upper.indexOf('CLOSED');
    if (eastIdx !== -1) {
      eastContext = upper.substring(Math.max(0, eastIdx - 30), Math.min(upper.length, eastIdx + 150));
    }
    if (eastContext.indexOf('TRACTOR') === -1 && eastContext.indexOf('TRUCK') === -1 && eastContext.indexOf('SEMI') === -1) {
      fullClosureEastbound = true;
      console.log('FULL eastbound closure detected');
    } else {
      console.log('Eastbound closure is truck-only');
    }
  }

  // Check for generic eastbound closure
  var eastClosedGeneric = upper.match(/IS\s+CLOSED\s+(?:TO\s+)?EASTBOUND(?!\s+TO\s+ALL\s+TRACTOR)/gi);
  if (eastClosedGeneric) {
    // Verify not truck-only by checking surrounding context
    var idx = upper.search(/IS\s+CLOSED\s+(?:TO\s+)?EASTBOUND/i);
    if (idx !== -1) {
      var ctx = upper.substring(idx, Math.min(upper.length, idx + 200));
      if (ctx.indexOf('TRACTOR') === -1 && ctx.indexOf('TRUCK') === -1 && ctx.indexOf('SEMI-TRAILER') === -1 && ctx.indexOf('SEMITRAILER') === -1) {
        fullClosureEastbound = true;
        console.log('FULL eastbound closure (generic pattern)');
      }
    }
  }

  var westClosedMatches = upper.match(/(?:IS\s+)?CLOSED\s+(?:TO\s+)?WESTBOUND\s+TRAFFIC/gi);
  if (westClosedMatches) {
    var westContext = '';
    var westIdx = upper.lastIndexOf('CLOSED');
    if (westIdx !== -1) {
      westContext = upper.substring(Math.max(0, westIdx - 30), Math.min(upper.length, westIdx + 150));
    }
    if (westContext.indexOf('TRACTOR') === -1 && westContext.indexOf('TRUCK') === -1 && westContext.indexOf('SEMI') === -1) {
      fullClosureWestbound = true;
      console.log('FULL westbound closure detected');
    } else {
      console.log('Westbound closure is truck-only');
    }
  }

  // Check for generic westbound closure
  var westClosedGeneric = upper.match(/IS\s+CLOSED\s+(?:TO\s+)?WESTBOUND(?!\s+TO\s+ALL\s+TRACTOR)/gi);
  if (westClosedGeneric) {
    var idx2 = upper.search(/IS\s+CLOSED\s+(?:TO\s+)?WESTBOUND/i);
    if (idx2 !== -1) {
      var ctx2 = upper.substring(idx2, Math.min(upper.length, idx2 + 200));
      if (ctx2.indexOf('TRACTOR') === -1 && ctx2.indexOf('TRUCK') === -1 && ctx2.indexOf('SEMI-TRAILER') === -1 && ctx2.indexOf('SEMITRAILER') === -1) {
        fullClosureWestbound = true;
        console.log('FULL westbound closure (generic pattern)');
      }
    }
  }

  // Check for "closed at [location]" without direction (means both)
  var genericClosed = upper.match(/IS\s+CLOSED\s+(?:AT|FROM|BETWEEN)\s+/gi);
  if (genericClosed) {
    // Check context for each match
    var searchStart = 0;
    for (var g = 0; g < genericClosed.length; g++) {
      var gIdx = upper.indexOf(genericClosed[g], searchStart);
      if (gIdx !== -1) {
        var gCtx = upper.substring(Math.max(0, gIdx - 50), Math.min(upper.length, gIdx + 200));
        if (gCtx.indexOf('TRACTOR') === -1 && gCtx.indexOf('TRUCK') === -1 && gCtx.indexOf('SEMITRAILER') === -1 && gCtx.indexOf('SEMI-TRAILER') === -1) {
          // This is a full closure without direction = both directions
          fullClosureEastbound = true;
          fullClosureWestbound = true;
          console.log('FULL both-direction closure detected (generic)');
        }
        searchStart = gIdx + 1;
      }
    }
  }

  var bothDirectionsFullyClosed = fullClosureEastbound && fullClosureWestbound;
  console.log('Full closure analysis:', {
    fullClosureEastbound: fullClosureEastbound,
    fullClosureWestbound: fullClosureWestbound,
    bothDirectionsFullyClosed: bothDirectionsFullyClosed,
    truckOnlyClosures: truckOnlyClosures,
  });

  // ============================================
  // RESTRICTION SIGNALS
  // ============================================
  var restrictionChecks = [
    { regex: /CHAINS?\s+(?:ARE\s+)?REQUIRED/gi, weight: 8 },
    { regex: /CHAIN\s+CONTROL/gi, weight: 8 },
    { regex: /\bR[\s-]?1\b/g, weight: 6 },
    { regex: /\bR[\s-]?2\b/g, weight: 8 },
    { regex: /\bR[\s-]?3\b/g, weight: 10 },
    { regex: /SNOW\s*TIRES?/gi, weight: 5 },
    { regex: /TRACTION\s+DEVICES?/gi, weight: 5 },
    { regex: /(?:4|FOUR)[\s-]*WHEEL[\s-]*DRIVE/gi, weight: 4 },
    { regex: /SPIN\s*-?\s*OUTS?/gi, weight: 5 },
    { regex: /TRUCKS?\s+(?:ARE\s+)?(?:BEING\s+)?SCREENED/gi, weight: 5 },
    { regex: /MAXIMUM\s+CHAINS/gi, weight: 6 },
    { regex: /PERMIT\s+LOADS?\s+(?:ARE\s+)?PROHIBITED/gi, weight: 4 },
    { regex: /ALTERNATE\s+ROUTE/gi, weight: 5 },
    { regex: /BRAKE\s+CHECK/gi, weight: 3 },
    { regex: /DUE\s+TO\s+(?:SNOW|ICE|WEATHER|STORM)/gi, weight: 4 },
    { regex: /ONE[\s-]*WAY\s+TRAFFIC/gi, weight: 5 },
    { regex: /CONVOY/gi, weight: 5 },
    { regex: /PILOT\s+CAR/gi, weight: 4 },
    { regex: /HAZARDOUS/gi, weight: 4 },
    { regex: /EXPECT\s+(?:MAJOR\s+)?DELAYS/gi, weight: 3 },
  ];

  // OPEN SIGNALS
  var openChecks = [
    { regex: /NO\s+(?:TRAFFIC\s+)?RESTRICTIONS/gi, weight: 10 },
    { regex: /OPEN\s+(?:AND\s+)?CLEAR/gi, weight: 8 },
    { regex: /ALL\s+LANES?\s+OPEN/gi, weight: 6 },
  ];

  var i, matches;

  // Truck-only closures count as restrictions
  if (truckOnlyClosures > 0) {
    restrictionScore += 8 * truckOnlyClosures;
    console.log('Truck closures add to restriction score:', 8 * truckOnlyClosures);
  }

  // Score restrictions
  for (i = 0; i < restrictionChecks.length; i++) {
    matches = upper.match(restrictionChecks[i].regex);
    if (matches) {
      restrictionScore += restrictionChecks[i].weight * matches.length;
      console.log('RESTRICTION:', restrictionChecks[i].regex.toString(), 'x' + matches.length);
    }
  }

  // Score open
  for (i = 0; i < openChecks.length; i++) {
    matches = upper.match(openChecks[i].regex);
    if (matches) {
      openScore += openChecks[i].weight * matches.length;
      console.log('OPEN:', openChecks[i].regex.toString(), 'x' + matches.length);
    }
  }

  console.log('FINAL SCORES - Restriction:', restrictionScore, 'Open:', openScore);

  // ============================================
  // DETERMINE STATUS
  // ============================================

  // RED: ONLY when both directions are fully closed to ALL traffic
  if (bothDirectionsFullyClosed) {
    return {
      status: 'closed',
      scores: { restriction: restrictionScore, open: openScore },
      note: 'Both directions closed to all traffic',
    };
  }

  // YELLOW: Any kind of restriction, partial closure, truck closure, chains, etc.
  if (restrictionScore >= 3) {
    return {
      status: 'restrictions',
      scores: { restriction: restrictionScore, open: openScore },
    };
  }

  // YELLOW: One direction fully closed (even to all traffic) but other is open/restricted
  if (fullClosureEastbound || fullClosureWestbound) {
    return {
      status: 'restrictions',
      scores: { restriction: restrictionScore, open: openScore },
      note: 'One direction closed to all traffic',
    };
  }

  // GREEN: Explicitly open
  if (openScore >= 5) {
    return {
      status: 'open',
      scores: { restriction: 0, open: openScore },
    };
  }

  // GREEN: Sierra content found but no bad signals
  var sierraLocations = ['COLFAX', 'DONNER', 'TRUCKEE', 'BAXTER', 'APPLEGATE', 'PLACER CO', 'NEVADA STATE'];
  var hasSierraContent = false;
  for (i = 0; i < sierraLocations.length; i++) {
    if (upper.indexOf(sierraLocations[i]) !== -1) {
      hasSierraContent = true;
      break;
    }
  }

  if (hasSierraContent) {
    return {
      status: 'open',
      scores: { restriction: 0, open: 0 },
      note: 'Sierra locations found, no restrictions detected',
    };
  }

  // GREEN: Page had real content, nothing bad found
  if (upper.length > 500) {
    return {
      status: 'open',
      scores: { restriction: 0, open: 0 },
      note: 'Content found but no restriction signals',
    };
  }

  // UNKNOWN: Could not read the page
  return {
    status: 'unknown',
    scores: { restriction: 0, open: 0 },
    debug: { textLength: upper.length },
  };
}

module.exports = function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=30');

  var isDebug = req.query && req.query.debug === 'true';

  console.log('\n========= NEW REQUEST =========');

  return fetchCaltransData()
    .then(function (html) {
      if (html) {
        return { source: 'caltrans-get', raw: html };
      }
      console.log('GET failed, trying POST...');
      return fetchCaltransPost().then(function (html2) {
        if (html2) {
          return { source: 'caltrans-post', raw: html2 };
        }
        return null;
      });
    })
    .then(function (result) {
      var now = new Date();
      var pacificTime = now.toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
      });

      if (!result) {
        console.log('ALL SOURCES FAILED');
        return res.status(200).json({
          status: 'unknown',
          details: ['Unable to reach Caltrans website.'],
          checkedAt: pacificTime,
          timestamp: now.toISOString(),
        });
      }

      console.log('Got data from:', result.source, 'length:', result.raw.length);

      var plainText = stripHTML(result.raw);
      console.log('Plain text length:', plainText.length);
      console.log('Plain text sample:', plainText.substring(0, 1500));

      var statusData = analyzeText(plainText);

      console.log('FINAL STATUS:', statusData.status);

      var response = {
        status: statusData.status,
        scores: statusData.scores,
        note: statusData.note,
        source: result.source,
        checkedAt: pacificTime,
        timestamp: now.toISOString(),
      };

      if (isDebug) {
        response.debug = {
          rawLength: result.raw.length,
          plainTextLength: plainText.length,
          plainTextSample: plainText.substring(0, 3000),
        };
      }

      return res.status(200).json(response);
    })
    .catch(function (error) {
      console.error('HANDLER ERROR:', error);
      return res.status(200).json({
        status: 'unknown',
        details: ['Server error: ' + error.message],
        checkedAt: new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }),
      });
    });
};
