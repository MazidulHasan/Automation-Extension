import { test, expect } from '@playwright/test';

test('Recorded Test Case', async ({ page }) => {
    await page.goto('https://www.saucedemo.com/');

    // Step 1: Enter "standard_user" in "Username"
    await page.getByPlaceholder('Username').fill('standard_user');

    // Step 2: Enter "secret_sauce" in "Password"
    await page.getByPlaceholder('Password').fill('secret_sauce');

    // Step 3: Click "Login"
    await page.getByRole('button', { name: 'Login' }).click();

    // Step 4: Click "Sauce Labs Bolt T-Shirt"
    await page.locator('.inventory_item').filter({ hasText: 'Sauce Labs Bolt T-Shirt' }).click();

    // Step 5: Click "Add to cart"
    await page.getByRole('button', { name: 'Add to cart' }).click();

    // Step 6: Click shopping cart
    await page.locator('.shopping_cart_link').click();

    // Step 7: Click "Checkout"
    await page.getByRole('button', { name: 'Checkout' }).click();

    // Verify final URL
    await expect(page).toHaveURL('https://www.saucedemo.com/checkout-step-one.html');
});
