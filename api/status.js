const fetch = require('node-fetch');

// ============================================
// FETCH DATA FROM MULTIPLE SOURCES
// We try several approaches to get road data.
// ============================================

async function fetchFromCaltransMain() {
  try {
    console.log('=== Trying Caltrans Main Page ===');
    const response = await fetch(
      'https://roads.dot.ca.gov/roadscell.php?roadnumber=80',
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: 'https://roads.dot.ca.gov/',
        },
        timeout: 12000,
        redirect: 'follow',
      }
    );

    console.log('Main page status:', response.status);
    const html = await response.text();
    console.log('Main page HTML length:', html.length);
    console.log('Main page first 500 chars:', html.substring(0, 500));

    if (html.length > 200) {
      return { source: 'caltrans-main', raw: html, type: 'html' };
    }
  } catch (error) {
    console.error('Main page error:', error.message);
  }
  return null;
}

async function fetchFromCaltransAPI() {
  try {
    console.log('=== Trying Caltrans Roads API ===');
    // This is the backend API that the Caltrans website itself calls
    const response = await fetch(
      'https://roads.dot.ca.gov/roadscell.php',
      {
        method: 'POST',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'text/html,*/*',
          Referer: 'https://roads.dot.ca.gov/',
          Origin: 'https://roads.dot.ca.gov',
        },
        body: 'roadnumber=80&submit=Search',
        timeout: 12000,
      }
    );

    console.log('API status:', response.status);
    const html = await response.text();
    console.log('API HTML length:', html.length);
    console.log('API first 500 chars:', html.substring(0, 500));

    if (html.length > 200) {
      return { source: 'caltrans-post', raw: html, type: 'html' };
    }
  } catch (error) {
    console.error('API error:', error.message);
  }
  return null;
}

async function fetchFromQuickMap() {
  try {
    console.log('=== Trying Caltrans QuickMap API ===');
    const response = await fetch(
      'https://quickmap.dot.ca.gov/api/roadConditions?format=json',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          Accept: 'application/json',
        },
        timeout: 12000,
      }
    );

    console.log('QuickMap status:', response.status);
    const text = await response.text();
    console.log('QuickMap response length:', text.length);
    console.log('QuickMap first 500 chars:', text.substring(0, 500));

    if (text.length > 100) {
      return { source: 'quickmap', raw: text, type: 'json' };
    }
  } catch (error) {
    console.error('QuickMap error:', error.message);
  }
  return null;
}

async function fetchFromCWWP() {
  try {
    console.log('=== Trying Caltrans CWWP2 ===');
    // This is another Caltrans endpoint
    const response = await fetch(
      'https://cwwp2.dot.ca.gov/data/d3/cctv/cctvStatusD03.json',
      {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          Accept: 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('CWWP status:', response.status);
    // We won't use this for conditions, but it tells us if Caltrans servers respond
    return null;
  } catch (error) {
    console.error('CWWP error:', error.message);
    return null;
  }
}

async function fetchAllSources() {
  // Try all sources, return first one that works
  const result =
    (await fetchFromCaltransMain()) ||
    (await fetchFromCaltransAPI()) ||
    (await fetchFromQuickMap());

  return result;
}

// ============================================
// TEXT EXTRACTION
// ============================================

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

// ============================================
// STATUS ANALYSIS
// ============================================

function analyzeText(text) {
  const upper = text.toUpperCase();
  const details = [];
  let closureScore = 0;
  let restrictionScore = 0;
  let openScore = 0;

  // --- CLOSURE SIGNALS ---
  const closureChecks = [
    { regex: /IS\s+CLOSED\s+(?:TO\s+)?(?:EASTBOUND|WESTBOUND|ALL|BOTH)?\s*(?:TRAFFIC)?/gi, weight: 10 },
    { regex: /CLOSED\s+(?:AT|FROM|BETWEEN|IN|NEAR)\b/gi, weight: 8 },
    { regex: /CLOSED\s+(?:TO\s+(?:EAST|WEST)BOUND)/gi, weight: 8 },
    { regex: /ROAD\s+(?:IS\s+)?CLOSED/gi, weight: 10 },
    { regex: /REMAINS?\s+CLOSED/gi, weight: 10 },
    { regex: /IMPASSABLE/gi, weight: 8 },
    { regex: /NO\s+ESTIMATED\s+(?:TIME|OPENING)/gi, weight: 8 },
  ];

  // --- RESTRICTION SIGNALS ---
  const restrictionChecks = [
    { regex: /CHAINS?\s+(?:ARE\s+)?REQUIRED/gi, weight: 8 },
    { regex: /CHAIN\s+CONTROL/gi, weight: 8 },
    { regex: /\bR[\s-]?1\b/g, weight: 6 },
    { regex: /\bR[\s-]?2\b/g, weight: 8 },
    { regex: /\bR[\s-]?3\b/g, weight: 10 },
    { regex: /SNOW\s*TIRES?\s+(?:ON\s+ALL|REQUIRED)/gi, weight: 5 },
    { regex: /TRACTION\s+DEVICES?/gi, weight: 5 },
    { regex: /(?:4|FOUR)[\s-]*WHEEL[\s-]*DRIVE/gi, weight: 4 },
    { regex: /SPIN\s*-?\s*OUTS?/gi, weight: 5 },
    { regex: /TRUCKS?\s+(?:ARE\s+)?(?:BEING\s+)?SCREENED/gi, weight: 5 },
    { regex: /MAXIMUM\s+CHAINS/gi, weight: 6 },
    { regex: /MUST\s+HAVE.*CHAINS/gi, weight: 6 },
    { regex: /PERMIT\s+LOADS?\s+(?:ARE\s+)?PROHIBITED/gi, weight: 4 },
    { regex: /(?:USE\s+(?:AN\s+)?)?ALTERNATE\s+ROUTE/gi, weight: 5 },
    { regex: /BRAKE\s+CHECK/gi, weight: 3 },
    { regex: /DUE\s+TO\s+(?:SNOW|ICE|WEATHER|STORM|WINTER|HEAVY)/gi, weight: 4 },
    { regex: /ONE[\s-]*WAY\s+TRAFFIC/gi, weight: 5 },
    { regex: /CONVOY/gi, weight: 5 },
    { regex: /ESCORT(?:S|ED)?/gi, weight: 3 },
    { regex: /PILOT\s+CAR/gi, weight: 4 },
    { regex: /EXPECT\s+(?:MAJOR\s+)?DELAYS/gi, weight: 3 },
    { regex: /HAZARDOUS/gi, weight: 4 },
  ];

  // --- OPEN SIGNALS ---
  const openChecks = [
    { regex: /NO\s+(?:TRAFFIC\s+)?RESTRICTIONS/gi, weight: 10 },
    { regex: /OPEN\s+(?:AND\s+)?(?:CLEAR|WITH\s+NO)/gi, weight: 8 },
    { regex: /ALL\s+LANES?\s+OPEN/gi, weight: 6 },
  ];

  // Score everything
  for (const check of closureChecks) {
    const matches = upper.match(check.regex);
    if (matches) {
      let count = matches.length;
      if (/CLOSED\s+TO\s+OVERSIZ/i.test(upper)) count = Math.max(0, count - 1);
      if (/RAMP\s+(?:IS\s+)?CLOSED/i.test(upper)) count = Math.max(0, count - 1);
      if (/REST\s*AREA.*CLOSED/i.test(upper)) count = Math.max(0, count - 1);
      if (count > 0) {
        closureScore += check.weight * count;
        console.log('CLOSURE:', check.regex.toString(), '×', count, '= +' + (check.weight * count));
      }
    }
  }

  for (const check of restrictionChecks) {
    const matches = upper.match(check.regex);
    if (matches) {
      restrictionScore += check.weight * matches.length;
      console.log('RESTRICTION:', check.regex.toString(), '×', matches.length, '= +' + (check.weight * matches.length));
    }
  }

  for (const check of openChecks) {
    const matches = upper.match(check.regex);
    if (matches) {
      openScore += check.weight * matches.length;
      console.log('OPEN:', check.regex.toString(), '×', matches.length, '= +' + (check.weight * matches.length));
    }
  }

  // Direction analysis
  const eastClosed = /CLOSED\s+(?:TO\s+)?EASTBOUND/i.test(upper) || /IS\s+CLOSED\s+(?:TO\s+)?EASTBOUND/i.test(upper);
  const westClosed = /CLOSED\s+(?:TO\s+)?WESTBOUND/i.test(upper) || /IS\s+CLOSED\s+(?:TO\s+)?WESTBOUND/i.test(upper);
  const bothClosed = eastClosed && westClosed;
  const allClosed = /IS\s+CLOSED(?!\s+(?:TO\s+)?(?:EAST|WEST)BOUND)/i.test(upper) && closureScore >= 10;

  console.log('SCORES -> Closure:', closureScore, 'Restriction:', restrictionScore, 'Open:', openScore);
  console.log('DIRECTIONS -> East closed:', eastClosed, 'West closed:', westClosed, 'Both:', bothClosed);

  // --- DETERMINE STATUS ---

  // Both directions fully closed = RED
  if (bothClosed || (allClosed && restrictionScore === 0)) {
    return { status: 'closed', details, scores: { closure: closureScore, restriction: restrictionScore, open: openScore } };
  }

  // Partial closure + restrictions = YELLOW
  if (closureScore > 0 && restrictionScore > 0) {
    return { status: 'restrictions', details, scores: { closure: closureScore, restriction: restrictionScore, open: openScore }, note: 'Partial closure with restrictions' };
  }

  // One direction closed = YELLOW
  if ((eastClosed && !westClosed) || (!eastClosed && westClosed)) {
    return { status: 'restrictions', details, scores: { closure: closureScore, restriction: restrictionScore, open: openScore }, note: 'One direction closed' };
  }

  // Strong closure signal only = RED
  if (closureScore >= 10) {
    return { status: 'closed', details, scores: { closure: closureScore, restriction: restrictionScore, open: openScore } };
  }

  // Any closure at all = YELLOW minimum
  if (closureScore > 0) {
    return { status: 'restrictions', details, scores: { closure: closureScore, restriction: restrictionScore, open: openScore } };
  }

  // Restrictions = YELLOW
  if (restrictionScore >= 3) {
    return { status: 'restrictions', details, scores: { closure: closureScore, restriction: restrictionScore, open: openScore } };
  }

  // Explicitly open = GREEN
  if (openScore >= 5) {
    return { status: 'open', details: ['No restrictions on I-80'], scores: { closure: 0, restriction: 0, open: openScore } };
  }

  // Fallback: check for ANY concerning content
  const sierraLocations = ['COLFAX', 'ALTA', 'EMIGRANT GAP', 'DONNER', 'TRUCKEE', 'FLORISTON', 'BAXTER', 'APPLEGATE', 'KINGVALE', 'SODA SPRINGS', 'NORDEN', 'NYACK', 'GOLD RUN', 'CISCO', 'PLACER CO', 'NEVADA STATE'];
  const hasSierraContent = sierraLocations.some(loc => upper.includes(loc));

  if (hasSierraContent && closureScore === 0 && restrictionScore === 0) {
    return { status: 'open', details: ['No restrictions detected'], scores: { closure: 0, restriction: 0, open: 0 }, note: 'Sierra locations found but no restriction signals' };
  }

  // If page had real content but nothing matched
  if (text.length > 500) {
    return { status: 'open', details: ['No restrictions detected on I-80'], scores: { closure: 0, restriction: 0, open: 0 }, note: 'Page had content but no signals detected - assuming open' };
  }

  return {
    status: 'unknown',
    details: ['Could not read Caltrans road conditions.'],
    scores: { closure: 0, restriction: 0, open: 0 },
    debug: { textLength: text.length, hasSierraContent, sample: text.substring(0, 300) }
  };
}

// ============================================
// MAIN HANDLER
// ============================================

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 's-maxage=90, stale-while-revalidate=30');

  // Debug mode: add ?debug=true to see raw data
  const isDebug = req.query && req.query.debug === 'true';

  try {
    console.log('\n\n========= NEW REQUEST =========');
    console.log('Time:', new Date().toISOString());

    const fetchResult = await fetchAllSources();

    if (!fetchResult) {
      console.log('ALL SOURCES FAILED - No data retrieved');

      const responseData = {
        status: 'unknown',
        details: ['Unable to reach Caltrans. All data sources failed.'],
        checkedAt: new Date().toLocaleString('en-US', {
          timeZone: 'America/Los_Angeles',
          month: 'short', day: 'numeric', year: 'numeric',
          hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
        }),
        timestamp: new Date().toISOString(),
        debug: isDebug ? { error: 'All fetch attempts failed' } : undefined,
      };

      return res.status(200).json(responseData);
    }

    console.log('Got data from source:', fetchResult.source);
    console.log('Data type:', fetchResult.type);
    console.log('Raw data length:', fetchResult.raw.length);

    // Extract plain text
    let plainText;
    if (fetchResult.type === 'html') {
      plainText = stripHTML(fetchResult.raw);
    } else {
      plainText = fetchResult.raw;
    }

    console.log('Plain text length:', plainText.length);
    console.log('=== PLAIN TEXT (first 3000) ===');
    console.log(plainText.substring(0, 3000));
    console.log('=== END PLAIN TEXT ===');

    // Analyze
    const statusData = analyzeText(plainText);

    const now = new Date();
    const pacificTime = now.toLocaleString('en-US', {
      timeZone: 'America/Los_Angeles',
      month: 'short', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true,
    });

    console.log('\n=== FINAL RESULT ===');
    console.log('Status:', statusData.status);
    console.log('Scores:', statusData.scores);
    console.log('====================\n');

    const responseData = {
      ...statusData,
      source: fetchResult.source,
      checkedAt: pacificTime,
      timestamp: now.toISOString(),
    };

    // In debug mode, include extra info
    if (isDebug) {
      responseData.debug = {
        source: fetchResult.source,
        rawLength: fetchResult.raw.length,
        plainTextLength: plainText.length,
        plainTextSample: plainText.substring(0, 2000),
        rawSample: fetchResult.raw.substring(0, 2000),
      };
    }

    res.status(200).json(responseData);
  } catch (error) {
    console.error('HANDLER ERROR:', error);
    res.status(500).json({
      status: 'unknown',
      details: ['Server error: ' + error.message],
      checkedAt: new Date().toLocaleString('en-US', {
        timeZone: 'America/Los_Angeles',
        hour: 'numeric', minute: '2-digit', hour12: true,
      }),
      error: error.message,
    });
  }
};
