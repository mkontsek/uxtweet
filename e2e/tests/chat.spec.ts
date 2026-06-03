import { test, expect, type Page } from '@playwright/test';

// A short, validation-safe token (3–20 chars of letters/digits/_/-) so the
// nicknames and message bodies a test creates don't collide with history left
// behind by earlier runs against the persistent dev server.
function token(): string {
    return Math.random().toString(36).slice(2, 8);
}

async function joinChat(page: Page, nickname: string): Promise<void> {
    await page.goto('/');
    await expect(page.getByTestId('landing-page')).toBeVisible();

    // Fill the nickname first: the submit button stays disabled until BOTH the
    // field is non-empty AND the WebSocket is open, so waiting for it to enable
    // afterwards also proves the client connected to the API. Quasar forwards
    // data-cy onto the native <input>, so fill the test-id locator directly.
    await page.getByTestId('nickname-input').fill(nickname);
    const submit = page.getByTestId('nickname-submit');
    await expect(submit).toBeEnabled({ timeout: 30_000 });
    await submit.click();

    await expect(page.getByTestId('chat-page')).toBeVisible();
    await expect(page.getByTestId('current-nickname')).toContainText(nickname);
}

async function sendMessage(page: Page, content: string): Promise<void> {
    await page.getByTestId('message-input-field').fill(content);
    await page.getByTestId('message-send-button').click();
}

async function readUserCount(page: Page): Promise<number> {
    const label = await page
        .getByTestId('connection-status-chip')
        .textContent();
    const match = label?.match(/(\d+)\s+online/);
    return match ? Number(match[1]) : 0;
}

test.describe('UXTweet chat', () => {
    test('connects, joins, and shows a sent message', async ({ page }) => {
        await joinChat(page, `e2e_${token()}`);

        await expect(page.getByTestId('connection-status-chip')).toContainText(
            'Connected'
        );

        const text = `hello ${token()}`;
        await sendMessage(page, text);

        // The message renders in the list and the input is cleared afterwards.
        await expect(
            page.getByTestId('message-content').filter({ hasText: text })
        ).toBeVisible();
        await expect(page.getByTestId('message-input-field')).toHaveValue('');
    });

    test('broadcasts between two clients and counts users', async ({
        browser,
    }) => {
        const alice = await browser.newContext();
        const bob = await browser.newContext();
        const alicePage = await alice.newPage();
        const bobPage = await bob.newPage();

        const aliceName = `alice_${token()}`;
        const bobName = `bob_${token()}`;

        try {
            await joinChat(alicePage, aliceName);
            await joinChat(bobPage, bobName);

            // With both clients connected, each chip reports at least 2 online.
            await expect
                .poll(() => readUserCount(alicePage), { timeout: 15_000 })
                .toBeGreaterThanOrEqual(2);

            // Alice's message reaches Bob, attributed to Alice.
            const fromAlice = `from-alice ${token()}`;
            await sendMessage(alicePage, fromAlice);
            const bobView = bobPage
                .getByTestId('message-item')
                .filter({ hasText: fromAlice });
            await expect(bobView.getByTestId('message-content')).toHaveText(
                fromAlice
            );
            await expect(bobView.getByTestId('message-author')).toHaveText(
                aliceName
            );

            // …and Bob's reply reaches Alice.
            const fromBob = `from-bob ${token()}`;
            await sendMessage(bobPage, fromBob);
            const aliceView = alicePage
                .getByTestId('message-item')
                .filter({ hasText: fromBob });
            await expect(aliceView.getByTestId('message-content')).toHaveText(
                fromBob
            );
            await expect(aliceView.getByTestId('message-author')).toHaveText(
                bobName
            );
        } finally {
            await alice.close();
            await bob.close();
        }
    });
});
