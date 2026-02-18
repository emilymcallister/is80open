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

  // ============================================
  // STEP 1: Extract ONLY the Northern California
  // / Sierra Nevada section
  // ============================================
  var sierraSection = upper;
  var ncStart = upper.indexOf('NORTHERN CALIFORNIA');
  if (ncStart !== -1) {
    // Find the end of this section (next section or end of text)
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
  // Split on common Caltrans sentence boundaries
  // ============================================
  var statements = sierraSection
    .split(/(?:(?:^|\s)IS\s+CLOSED|CHAINS?\s+(?:ARE\s+)?REQUIRED|ALL\s+(?:EAST|WEST)BOUND|PLEASE\s+|MOTORISTS?\s+|NO\s+TRAFFIC)/i)
    .map(function(s) { return s.trim(); })
    .filter(function(s) { return s.length > 10; });

  // Better approach: find each sentence-like chunk
  // Caltrans separates statements, so let's re-scan the sierra section
  // for individual condition statements

  console.log('\n=== ANALYZING SIERRA SECTION ===');
  console.log(sierraSection);
  console.log('================================\n');

  // ============================================
  // STEP 3: Look for FULL road closures
  // (closed to ALL traffic, not just trucks)
  // ============================================

  var hasFullClosure = false;

  // Pattern A: "Is closed from [place] to [place]" — no direction = both directions = FULL CLOSURE
  // But we need to make sure it's not "closed eastbound" or "closed to trucks"
  var closedFromPattern = /IS\s+CLOSED\s+FROM\s+/gi;
  var closedFromMatches = [];
  var cfMatch;
  while ((cfMatch = closedFromPattern.exec(sierraSection)) !== null) {
    closedFromMatches.push(cfMatch.index);
  }

  for (var cf = 0; cf < closedFromMatches.length; cf++) {
    // Look at what comes BEFORE "Is closed from" (up to 80 chars)
    var beforeText = sierraSection.substring(Math.max(0, closedFromMatches[cf] - 80), closedFromMatches[cf]);
    // Look at what comes AFTER (up to 300 chars)
    var afterText = sierraSection.substring(closedFromMatches[cf], Math.min(sierraSection.length, closedFromMatches[cf] + 300));

    console.log('Checking "closed from" - before:', beforeText.substring(beforeText.length - 40));
    console.log('Checking "closed from" - after:', afterText.substring(0, 150));

    // If "eastbound" or "westbound" appears right before, it's directional
    var isDirectional = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeText);
    // If "tractor" or "truck" or "semi" appears nearby, it's truck-only
    var isTruckOnly = /TRACTOR|SEMI|TRUCK|COMMERCIAL/.test(afterText.substring(0, 150));

    if (!isDirectional && !isTruckOnly) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE DETECTED: "Is closed from..." with no direction and not truck-only');
    } else {
      console.log('>>> Skipped: directional=' + isDirectional + ' truckOnly=' + isTruckOnly);
    }
  }

  // Pattern B: "Is closed at [place]" — no direction = FULL CLOSURE
  var closedAtPattern = /IS\s+CLOSED\s+AT\s+/gi;
  var closedAtMatches = [];
  var caMatch;
  while ((caMatch = closedAtPattern.exec(sierraSection)) !== null) {
    closedAtMatches.push(caMatch.index);
  }

  for (var ca = 0; ca < closedAtMatches.length; ca++) {
    var beforeAt = sierraSection.substring(Math.max(0, closedAtMatches[ca] - 80), closedAtMatches[ca]);
    var afterAt = sierraSection.substring(closedAtMatches[ca], Math.min(sierraSection.length, closedAtMatches[ca] + 300));

    var isDirectionalAt = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeAt);
    var isTruckAt = /TRACTOR|SEMI|TRUCK|COMMERCIAL/.test(afterAt.substring(0, 150));

    if (!isDirectionalAt && !isTruckAt) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE DETECTED: "Is closed at..." with no direction');
    }
  }

  // Pattern C: "Is closed between [place] and [place]"
  var closedBetweenPattern = /IS\s+CLOSED\s+BETWEEN\s+/gi;
  var cbMatch;
  while ((cbMatch = closedBetweenPattern.exec(sierraSection)) !== null) {
    var beforeBw = sierraSection.substring(Math.max(0, cbMatch.index - 80), cbMatch.index);
    var afterBw = sierraSection.substring(cbMatch.index, Math.min(sierraSection.length, cbMatch.index + 300));

    var isDirectionalBw = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeBw);
    var isTruckBw = /TRACTOR|SEMI|TRUCK|COMMERCIAL/.test(afterBw.substring(0, 150));

    if (!isDirectionalBw && !isTruckBw) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE DETECTED: "Is closed between..."');
    }
  }

  // Pattern D: "Is closed due to [reason]" — no direction = FULL CLOSURE
  var closedDuePattern = /IS\s+CLOSED\s+DUE\s+TO\s+/gi;
  var cdMatch;
  while ((cdMatch = closedDuePattern.exec(sierraSection)) !== null) {
    var beforeDue = sierraSection.substring(Math.max(0, cdMatch.index - 80), cdMatch.index);
    var afterDue = sierraSection.substring(cdMatch.index, Math.min(sierraSection.length, cdMatch.index + 300));

    var isDirectionalDue = /(?:EASTBOUND|WESTBOUND)\s*$/.test(beforeDue);
    var isTruckDue = /TRACTOR|SEMI|TRUCK|COMMERCIAL/.test(afterDue.substring(0, 150));

    if (!isDirectionalDue && !isTruckDue) {
      hasFullClosure = true;
      console.log('>>> FULL CLOSURE DETECTED: "Is closed due to..."');
    }
  }

  // Pattern E: "Is closed in both directions"
  if (/IS\s+CLOSED\s+(?:IN\s+)?BOTH\s+DIRECTIONS/i.test(sierraSection)) {
    hasFullClosure = true;
    console.log('>>> FULL CLOSURE DETECTED: "Is closed in both directions"');
  }

  // Pattern F: Check if both eastbound AND westbound are separately closed to all traffic
  var eastFullClosed = false;
  var westFullClosed = false;

  // "Is closed to eastbound traffic" or "Is closed eastbound" (not truck-only)
  var eastClosedPattern = /IS\s+CLOSED\s+(?:TO\s+)?EASTBOUND\s+(?:TRAFFIC)?/gi;
  var ecMatch;
  while ((ecMatch = eastClosedPattern.exec(sierraSection)) !== null) {
    var ecAfter = sierraSection.substring(ecMatch.index, Math.min(sierraSection.length, ecMatch.index + 200));
    if (ecAfter.indexOf('TRACTOR') === -1 && ecAfter.indexOf('SEMI') === -1 && ecAfter.indexOf('TRUCK') === -1 && ecAfter.indexOf('COMMERCIAL') === -1) {
      eastFullClosed = true;
      console.log('>>> Eastbound FULL closure detected');
    }
  }

  // Also check "closed eastbound to all tractor" — this is truck only, NOT full
  // (already handled by the truck check above)

  var westClosedPattern = /IS\s+CLOSED\s+(?:TO\s+)?WESTBOUND\s+(?:TRAFFIC)?/gi;
  var wcMatch;
  while ((wcMatch = westClosedPattern.exec(sierraSection)) !== null) {
    var wcAfter = sierraSection.substring(wcMatch.index, Math.min(sierraSection.length, wcMatch.index + 200));
    if (wcAfter.indexOf('TRACTOR') === -1 && wcAfter.indexOf('SEMI') === -1 && wcAfter.indexOf('TRUCK') === -1 && wcAfter.indexOf('COMMERCIAL') === -1) {
      westFullClosed = true;
      console.log('>>> Westbound FULL closure detected');
    }
  }

  if (eastFullClosed && westFullClosed) {
    hasFullClosure = true;
    console.log('>>> FULL CLOSURE: Both east and west separately closed to all traffic');
  }

  console.log('\n=== CLOSURE RESULT: hasFullClosure =', hasFullClosure, '===\n');

  // ============================================
  // STEP 4: Score restrictions
  // ============================================

  var restrictionScore = 0;
  var openScore = 0;

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
    { regex: /CLOSED\s+(?:EASTBOUND\s+|WESTBOUND\s+)?(?:TO\s+)?ALL\s+TRACTOR/gi, weight: 8 },
    { regex: /CLOSED\s+(?:TO\s+)?(?:ALL\s+)?TRUCKS/gi, weight: 8 },
  ];

  var openChecks = [
    { regex: /NO\s+(?:TRAFFIC\s+)?RESTRICTIONS/gi, weight: 10 },
    { regex: /OPEN\s+(?:AND\s+)?CLEAR/gi, weight: 8 },
    { regex: /ALL\s+LANES?\s+OPEN/gi, weight: 6 },
  ];

  var i, matches;

  for (i = 0; i < restrictionChecks.length; i++) {
    matches = sierraSection.match(restrictionChecks[i].regex);
    if (matches) {
      restrictionScore += restrictionChecks[i].weight * matches.length;
      console.log('RESTRICTION:', restrictionChecks[i].regex.toString(), 'x' + matches.length);
    }
  }

  for (i = 0; i < openChecks.length; i++) {
    matches = sierraSection.match(openChecks[i].regex);
    if (matches) {
      openScore += openChecks[i].weight * matches.length;
      console.log('OPEN:', openChecks[i].regex.toString(), 'x' + matches.length);
    }
  }

  console.log('SCORES - Restriction:', restrictionScore, 'Open:', openScore);

  // ============================================
  // STEP 5: DETERMINE FINAL STATUS
  // ============================================

  // RED: Full road closure (both directions, all traffic)
  if (hasFullClosure) {
    console.log('FINAL: CLOSED');
    return {
      status: 'closed',
      scores: { restriction: restrictionScore, open: openScore },
      note: 'Full closure detected - road closed to all traffic',
    };
  }

  // YELLOW: Any restrictions (chains, truck closures, partial closures, etc.)
  if (restrictionScore >= 3) {
    console.log('FINAL: RESTRICTIONS');
    return {
      status: 'restrictions',
      scores: { restriction: restrictionScore, open: openScore },
    };
  }

  // YELLOW: One direction fully closed to all traffic
  if (eastFullClosed || westFullClosed) {
    console.log('FINAL: RESTRICTIONS (one direction)');
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

  // GREEN: Sierra locations but nothing bad
  var sierraLocations = ['COLFAX', 'DONNER', 'TRUCKEE', 'BAXTER', 'APPLEGATE', 'PLACER CO', 'NEVADA STATE'];
  var hasSierraContent = false;
  for (i = 0; i < sierraLocations.length; i++) {
    if (sierraSection.indexOf(sierraLocations[i]) !== -1) {
      hasSierraContent = true;
      break;
    }
  }

  if (hasSierraContent) {
    console.log('FINAL: OPEN (sierra content, no bad signals)');
    return {
      status: 'open',
      scores: { restriction: 0, open: 0 },
    };
  }

  if (sierraSection.length > 100) {
    console.log('FINAL: OPEN (content but no signals)');
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
