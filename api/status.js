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

// ============================================
// Helper: Check if a statement is ONLY about
// trucks / commercial vehicles (not regular cars)
// ============================================
function isTruckOnlyStatement(text) {
  var upper = text.toUpperCase();

  // Phrases that indicate this is truck/commercial specific
  var truckIndicators = [
    /\bTRUCKS?\b/i,
    /\bTRACTOR[\s-]*SEMI/i,
    /\bSEMI[\s-]*TRAILER/i,
    /\bSEMITRAILER/i,
    /\bCOMMERCIAL\s+VEHICLE/i,
    /\bTRACTOR[\s-]*TRAILER/i,
    /\bBIG\s+RIG/i,
    /\bFREIGHT/i,
    /\bCARGO/i,
    /\bPERMIT\s+LOAD/i,
    /\bOVERSIZ/i,
    /\bBRAKE\s+CHECK/i,
    /\bBRAKE\s+FIRE/i,
    /\bWEIGH\s+STATION/i,
    /\bSCREENED/i,
    /\bSCREENING/i,
  ];

  for (var i = 0; i < truckIndicators.length; i++) {
    if (truckIndicators[i].test(upper)) {
      return true;
    }
  }

  return false;
}

function analyzeText(text) {
  var upper = text.toUpperCase();

  // ============================================
  // STEP 1: Extract ONLY the Northern California
  // / Sierra Nevada section
  // ============================================
  var sierraSection = upper;
  var ncStart = upper.indexOf('NORTHERN CALIFORNIA');
  if (ncStart !== -1) {
    var nextSection = upper.indexOf('BUSINESS 80', ncStart + 20);
    if (nextSection === -1) {
      nextSection = upper.indexOf('[IN THE', ncStart + 20);
    }
    if (nextSection === -1) {
      nextSection = upper.length;
    }
    sierraSection = upper.substring(ncStart, nextSection);
    console.log('Extracted Sierra section:', sierraSection.length, 'chars');
    console.log('Sierra section text:', sierraSection);
  } else {
    console.log('Could not find Northern California section, using full text');
  }

  // ============================================
  // STEP 2: Break into individual statements
  // Caltrans separates conditions roughly by
  // sentence-like chunks. We split on patterns
  // that typically start new statements.
  // ============================================

  // Split the sierra section into individual statement chunks
  // Each statement typically starts with "Is closed", "Chains are",
  // "All westbound trucks", etc.
  var statementBreakers = /(?=\bIS\s+CLOSED\b)|(?=\bCHAINS?\s+(?:ARE\s+)?REQUIRED\b)|(?=\bALL\s+(?:EAST|WEST)BOUND\b)|(?=\b(?:EAST|WEST)BOUND\s+TRUCKS?\b)|(?=\bPLEASE\s+)|(?=\bMOTORISTS?\s+)|(?=\bNO\s+TRAFFIC\b)|(?=\bTHERE\s+IS\b)/gi;

  var rawStatements = sierraSection.split(statementBreakers).filter(function(s) {
    return s && s.trim().length > 10;
  });

  console.log('\n=== INDIVIDUAL STATEMENTS ===');
  for (var s = 0; s < rawStatements.length; s++) {
    var stmt = rawStatements[s].trim();
    var truckOnly = isTruckOnlyStatement(stmt);
    console.log('Statement ' + s + ' [' + (truckOnly ? 'TRUCK-ONLY' : 'ALL VEHICLES') + ']:', stmt.substring(0, 120));
  }
  console.log('=============================\n');

  // ============================================
  // STEP 3: Look for FULL road closures
  // (closed to ALL traffic, not just trucks)
  // ============================================

  var hasFullClosure = false;

  // Pattern A: "Is closed from [place] to [place]" — no direction = both
  var closedFromPattern = /IS\s+CLOSED\s+FROM\s+/gi;
  var cfMatch;
  while ((cfMatch = closedFromPattern.exec(sierraSection)) !== null) {
    var beforeText = sierraSection.substring(Math.max(0, cfMatch.index - 80), cfMatch.index);
    var afterText = sierraSection.substring(cfMatch.index, Math.min(sierraSection.length, cfMatch.index + 300));
    var fullContext = beforeText + afterText;

    var isDirectional = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeText);
    var isTruckRelated = isTruckOnlyStatement(afterText.substring(0, 200));

    if (!isDirectional && !isTruckRelated) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE: "Is closed from..." (no direction, not truck-only)');
    } else {
      console.log('>>> Skipped closure: directional=' + isDirectional + ' truck=' + isTruckRelated);
    }
  }

  // Pattern B: "Is closed at [place]" — no direction = both
  var closedAtPattern = /IS\s+CLOSED\s+AT\s+/gi;
  var caMatch;
  while ((caMatch = closedAtPattern.exec(sierraSection)) !== null) {
    var beforeAt = sierraSection.substring(Math.max(0, caMatch.index - 80), caMatch.index);
    var afterAt = sierraSection.substring(caMatch.index, Math.min(sierraSection.length, caMatch.index + 300));

    var isDirectionalAt = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeAt);
    var isTruckAt = isTruckOnlyStatement(afterAt.substring(0, 200));

    if (!isDirectionalAt && !isTruckAt) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE: "Is closed at..." (no direction, not truck-only)');
    }
  }

  // Pattern C: "Is closed between [place] and [place]"
  var closedBetweenPattern = /IS\s+CLOSED\s+BETWEEN\s+/gi;
  var cbMatch;
  while ((cbMatch = closedBetweenPattern.exec(sierraSection)) !== null) {
    var beforeBw = sierraSection.substring(Math.max(0, cbMatch.index - 80), cbMatch.index);
    var afterBw = sierraSection.substring(cbMatch.index, Math.min(sierraSection.length, cbMatch.index + 300));

    var isDirectionalBw = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeBw);
    var isTruckBw = isTruckOnlyStatement(afterBw.substring(0, 200));

    if (!isDirectionalBw && !isTruckBw) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE: "Is closed between..."');
    }
  }

  // Pattern D: "Is closed due to [reason]" — no direction = both
  var closedDuePattern = /IS\s+CLOSED\s+DUE\s+TO\s+/gi;
  var cdMatch;
  while ((cdMatch = closedDuePattern.exec(sierraSection)) !== null) {
    var beforeDue = sierraSection.substring(Math.max(0, cdMatch.index - 80), cdMatch.index);
    var afterDue = sierraSection.substring(cdMatch.index, Math.min(sierraSection.length, cdMatch.index + 300));

    var isDirectionalDue = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeDue);
    var isTruckDue = isTruckOnlyStatement(afterDue.substring(0, 200));

    if (!isDirectionalDue && !isTruckDue) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE: "Is closed due to..."');
    }
  }

  // Pattern E: "Is closed in both directions"
  if (/IS\s+CLOSED\s+(?:IN\s+)?BOTH\s+DIRECTIONS/i.test(sierraSection)) {
    hasFullClosure = true;
    console.log('>>> FULL CLOSURE: "Is closed in both directions"');
  }

  // Pattern F: Both eastbound and westbound separately closed to ALL traffic (not trucks)
  var eastFullClosed = false;
  var westFullClosed = false;

  var eastClosedPattern = /IS\s+CLOSED\s+(?:TO\s+)?EASTBOUND\s+(?:TRAFFIC)?/gi;
  var ecMatch;
  while ((ecMatch = eastClosedPattern.exec(sierraSection)) !== null) {
    var ecAfter = sierraSection.substring(ecMatch.index, Math.min(sierraSection.length, ecMatch.index + 250));
    if (!isTruckOnlyStatement(ecAfter)) {
      eastFullClosed = true;
      console.log('>>> Eastbound FULL closure (all traffic)');
    } else {
      console.log('>>> Eastbound closure is truck-only, skipping');
    }
  }

  var westClosedPattern = /IS\s+CLOSED\s+(?:TO\s+)?WESTBOUND\s+(?:TRAFFIC)?/gi;
  var wcMatch;
  while ((wcMatch = westClosedPattern.exec(sierraSection)) !== null) {
    var wcAfter = sierraSection.substring(wcMatch.index, Math.min(sierraSection.length, wcMatch.index + 250));
    if (!isTruckOnlyStatement(wcAfter)) {
      westFullClosed = true;
      console.log('>>> Westbound FULL closure (all traffic)');
    } else {
      console.log('>>> Westbound closure is truck-only, skipping');
    }
  }

  if (eastFullClosed && westFullClosed) {
    hasFullClosure = true;
    console.log('>>> FULL CLOSURE: Both directions closed to all traffic');
  }

  console.log('\n=== CLOSURE RESULT: hasFullClosure =', hasFullClosure, '===\n');

  // ============================================
  // STEP 4: Score restrictions
  // ONLY count things that affect regular cars
  // Skip anything that is truck-only
  // ============================================

  var restrictionScore = 0;
  var openScore = 0;

  // These restrictions affect ALL vehicles including regular cars
  var carRestrictionChecks = [
    { regex: /CHAINS?\s+(?:ARE\s+)?REQUIRED\s+ON\s+ALL\s+VEHICLES/gi, weight: 10 },
    { regex: /CHAINS?\s+(?:ARE\s+)?REQUIRED/gi, weight: 8 },
    { regex: /CHAIN\s+CONTROL/gi, weight: 8 },
    { regex: /\bR[\s-]?1\b/g, weight: 6 },
    { regex: /\bR[\s-]?2\b/g, weight: 8 },
    { regex: /\bR[\s-]?3\b/g, weight: 10 },
    { regex: /SNOW\s*TIRES?\s+ON\s+ALL/gi, weight: 5 },
    { regex: /TRACTION\s+DEVICES?\s+(?:ARE\s+)?REQUIRED/gi, weight: 6 },
    { regex: /(?:4|FOUR)[\s-]*WHEEL[\s-]*DRIVE/gi, weight: 4 },
    { regex: /SPIN\s*-?\s*OUTS?/gi, weight: 5 },
    { regex: /ONE[\s-]*WAY\s+TRAFFIC/gi, weight: 5 },
    { regex: /CONVOY/gi, weight: 5 },
    { regex: /HAZARDOUS\s+CONDITIONS/gi, weight: 5 },
    { regex: /WHITEOUT/gi, weight: 5 },
    { regex: /ZERO\s+VISIBILITY/gi, weight: 5 },
    { regex: /MOTORISTS\s+ARE\s+ADVISED\s+TO\s+USE\s+AN?\s+ALTERNATE/gi, weight: 5 },
  ];

  // These are specifically about the CLOSURE of the road to regular traffic
  // in one direction (makes it a restriction, not full closure)
  var directionalClosureForCars = [];

  if (eastFullClosed && !westFullClosed) {
    directionalClosureForCars.push('eastbound');
    restrictionScore += 15;
    console.log('One-direction car closure (east) adds 15 to restriction score');
  }
  if (westFullClosed && !eastFullClosed) {
    directionalClosureForCars.push('westbound');
    restrictionScore += 15;
    console.log('One-direction car closure (west) adds 15 to restriction score');
  }

  var i, matches;

  for (i = 0; i < carRestrictionChecks.length; i++) {
    matches = sierraSection.match(carRestrictionChecks[i].regex);
    if (matches) {
      // For each match, check if it's in a truck-only context
      // We do this by finding each match position and checking surrounding text
      var validCount = 0;
      var regex = new RegExp(carRestrictionChecks[i].regex.source, 'gi');
      var m;
      while ((m = regex.exec(sierraSection)) !== null) {
        // Get the full statement this match belongs to
        // Look back to find the start of this statement
        var stmtStart = m.index;
        // Look backwards for a statement boundary
        var lookback = sierraSection.substring(Math.max(0, m.index - 150), m.index);
        var boundaryMatch = lookback.match(/(?:^|\.|\n)\s*(?=[A-Z])/);
        if (boundaryMatch) {
          stmtStart = Math.max(0, m.index - 150) + boundaryMatch.index;
        } else {
          stmtStart = Math.max(0, m.index - 100);
        }

        var stmtEnd = Math.min(sierraSection.length, m.index + 200);
        var statementContext = sierraSection.substring(stmtStart, stmtEnd);

        // Only count if this statement is NOT truck-only
        if (!isTruckOnlyStatement(statementContext)) {
          validCount++;
        } else {
          console.log('Skipping truck-only match for:', carRestrictionChecks[i].regex.toString());
        }
      }

      if (validCount > 0) {
        restrictionScore += carRestrictionChecks[i].weight * validCount;
        console.log('CAR RESTRICTION:', carRestrictionChecks[i].regex.toString(), 'x' + validCount);
      }
    }
  }

  var openChecks = [
    { regex: /NO\s+(?:TRAFFIC\s+)?RESTRICTIONS/gi, weight: 10 },
    { regex: /OPEN\s+(?:AND\s+)?CLEAR/gi, weight: 8 },
    { regex: /ALL\s+LANES?\s+OPEN/gi, weight: 6 },
  ];

  for (i = 0; i < openChecks.length; i++) {
    matches = sierraSection.match(openChecks[i].regex);
    if (matches) {
      openScore += openChecks[i].weight * matches.length;
      console.log('OPEN:', openChecks[i].regex.toString(), 'x' + matches.length);
    }
  }

  console.log('FINAL SCORES - Restriction:', restrictionScore, 'Open:', openScore);

  // ============================================
  // STEP 5: DETERMINE FINAL STATUS
  // ============================================

  // RED: Full road closure (both directions, all traffic)
  if (hasFullClosure) {
    console.log('FINAL: CLOSED');
    return {
      status: 'closed',
      scores: { restriction: restrictionScore, open: openScore },
      note: 'Full closure - road closed to all traffic',
    };
  }

  // YELLOW: Restrictions that affect regular cars
  if (restrictionScore >= 3) {
    console.log('FINAL: RESTRICTIONS');
    return {
      status: 'restrictions',
      scores: { restriction: restrictionScore, open: openScore },
    };
  }

  // YELLOW: One direction fully closed to all traffic
  if (eastFullClosed || westFullClosed) {
    console.log('FINAL: RESTRICTIONS (one direction closed)');
    return {
      status: 'restrictions',
      scores: { restriction: restrictionScore, open: openScore },
      note: 'One direction closed to all traffic',
    };
  }

  // GREEN: Explicitly no restrictions
  if (openScore >= 5) {
    console.log('FINAL: OPEN (explicit)');
    return {
      status: 'open',
      scores: { restriction: 0, open: openScore },
    };
  }

  // GREEN: Sierra locations but nothing bad for cars
  var sierraLocations = ['COLFAX', 'DONNER', 'TRUCKEE', 'BAXTER', 'APPLEGATE', 'PLACER CO', 'NEVADA STATE'];
  var hasSierraContent = false;
  for (i = 0; i < sierraLocations.length; i++) {
    if (sierraSection.indexOf(sierraLocations[i]) !== -1) {
      hasSierraContent = true;
      break;
    }
  }

  if (hasSierraContent) {
    console.log('FINAL: OPEN (sierra content, nothing affecting cars)');
    return {
      status: 'open',
      scores: { restriction: 0, open: 0 },
      note: 'Only truck-specific notices found, road open for regular vehicles',
    };
  }

  if (sierraSection.length > 100) {
    console.log('FINAL: OPEN (content but no car-relevant signals)');
    return {
      status: 'open',
      scores: { restriction: 0, open: 0 },
    };
  }

  console.log('FINAL: UNKNOWN');
  return {
    status: 'unknown',
    scores: { restriction: 0, open: 0 },
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
