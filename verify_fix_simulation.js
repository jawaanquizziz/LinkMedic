
const htmlRegex = /(?:src|href|include|require|include_once|require_once)\s*=?\s*\(?\s*["']([^"']+)["']/g;
const mernRegex = /(?:import|from|require)\s*\(?["']([^"']+)["']\)?/g;

const testCases = [
    { text: `const img = \`../../images/user.png'\``, description: "User reported interpolated string with single quote at end", shouldMatch: false }, // The user's example: user.png'"> - wait, the user said `user.png'">` which implies it matched `'` as the delimiter but the content had `">`.
    // Actually looking at the user request: "if it doesn't find any paths in like ../../images/user.png'"> herer dots are there here also imgPath} showing error"
    // And "research_profile.php?id=${f.id}"
    { text: `href="research_profile.php?id=\${f.id}"`, description: "HTML/PHP link with query param and interpolation", shouldBeIgnored: true },
    { text: `src="image.png"`, description: "Valid simple image", shouldMatch: true },
    { text: `const x = "foo"; const y = "bar";`, description: "Random javascript", shouldMatch: false }
];

console.log("--- Starting Regex Verification ---");

function check(text, isMern) {
    const regex = isMern ? mernRegex : htmlRegex;
    // Reset regex
    regex.lastIndex = 0;

    let match;
    while ((match = regex.exec(text))) {
        const captured = match[1];
        console.log(`Matched: '${captured}' in text: '${text}'`);

        // Proposed Logic Simulation
        let result = captured;

        // 1. Check for Iterpolation
        if (result.includes('${') || result.includes('{$')) {
            console.log("  -> IGNORED (Interpolation detected)");
            continue;
        }

        // 2. Strip Query Params
        if (result.includes('?')) {
            const parts = result.split('?');
            result = parts[0];
            console.log(`  -> STRIPPED Query Param: '${result}'`);
        }

        // 3. User's weird single quote case: `../../images/user.png'">`
        // If the regex matched `../../images/user.png'">` it means the closing quote was `"` or `'` but it captured the quote inside?
        // Let's see what it actually captures below.
    }
}

// Case 1: The user's weird string
const userString1 = `const imgPath = \`../../images/user.png'\`;`;
// Note: User said: `../../images/user.png'">` 
// Maybe html? `<img src="../../images/user.png'">` <- invalid html but might happen in php echo?
// Let's try the research profile one which is clearer.
const userString2 = `href="research_profile.php?id=\${f.id}"`;

console.log("\nTesting User String 2 (HTML/PHP Context):");
check(userString2, false);

const userString3 = "include('header.php');";
console.log("\nTesting PHP Include:");
check(userString3, false);

const userString4 = `import x from './component';`;
console.log("\nTesting Import:");
check(userString4, true);

// User's first example reconstruction
// "if it doesn't find any paths in like ../../images/user.png'">"
// This looks like `src="../../images/user.png'"` -> The regex might capture `../../images/user.png'` if it matches the first `"` as start and fails to find end? Or `src='...'`?
const userString5 = `src="../../images/user.png'">`;
console.log("\nTesting User String 5:");
check(userString5, false);
