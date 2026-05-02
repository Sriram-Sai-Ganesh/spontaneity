# Theme Toggle Test Plan

Seed file: `e2e/seed.spec.ts`

## 1. Theme Selection

### 1.1 Switch to light theme

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Click the "Toggle theme" button in the header
4. Click the "Light" menu item

**Expected:**

- The `<html>` element has class `light` and does not have class `dark`
- The `<html>` element has `style.colorScheme` equal to `light`

### 1.2 Switch to dark theme

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Click the "Toggle theme" button in the header
4. Click the "Dark" menu item

**Expected:**

- The `<html>` element has class `dark` and does not have class `light`
- The `<html>` element has `style.colorScheme` equal to `dark`

### 1.3 Switch to system theme

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Click the "Toggle theme" button to open the dropdown
4. Click the "Dark" menu item (to move away from the default)
5. Click the "Toggle theme" button again
6. Click the "System" menu item

**Expected:**

- The `<html>` element has either class `light` or `dark` depending on the emulated system preference
- The `<html>` element does not have both `light` and `dark` classes simultaneously

## 2. Theme Persistence

### 2.1 Selected theme persists across page reload

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Click the "Toggle theme" button
4. Click the "Dark" menu item
5. Reload the page

**Expected:**

- After reload, the `<html>` element still has class `dark`
- localStorage contains key `"theme"` with value `"dark"` (JSON-encoded)

### 2.2 Default theme is system when no preference is stored

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload

**Expected:**

- The theme follows the browser's `prefers-color-scheme` media query
- No explicit `"theme"` key in localStorage until the user makes a selection (or it initializes to `"system"`)

## 3. System Theme Preference

### 3.1 System theme follows emulated dark preference

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Use Playwright to emulate `prefers-color-scheme: dark`
4. Ensure theme is set to "System" (the default)

**Expected:**

- The `<html>` element has class `dark`
- The `<html>` element has `style.colorScheme` equal to `dark`

### 3.2 System theme follows emulated light preference

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Use Playwright to emulate `prefers-color-scheme: light`
4. Ensure theme is set to "System" (the default)

**Expected:**

- The `<html>` element has class `light`
- The `<html>` element has `style.colorScheme` equal to `light`

### 3.3 Explicit theme overrides system preference

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Use Playwright to emulate `prefers-color-scheme: dark`
4. Click the "Toggle theme" button
5. Click the "Light" menu item

**Expected:**

- Despite the system preferring dark, the `<html>` element has class `light`
- The explicit selection overrides the system preference

## 4. Dropdown Menu Behavior

### 4.1 Dropdown opens and shows all three options

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Click the "Toggle theme" button

**Expected:**

- A dropdown menu appears with exactly three items: "Light", "Dark", "System"

### 4.2 Dropdown closes after selecting an option

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Click the "Toggle theme" button
4. Click the "Dark" menu item

**Expected:**

- The dropdown menu closes after selection
- The theme is applied (class `dark` on `<html>`)

### 4.3 Dropdown closes when clicking outside

**Steps:**

1. Navigate to `/`
2. Clear localStorage and reload
3. Click the "Toggle theme" button
4. Click somewhere outside the dropdown (e.g., the page body)

**Expected:**

- The dropdown menu closes
- No theme change occurs

## 5. Corrupted Storage

### 5.1 Invalid localStorage value falls back to system

**Steps:**

1. Navigate to `/`
2. Set localStorage key `"theme"` to `"invalid-value"`
3. Reload the page

**Expected:**

- The app does not crash
- The theme falls back to `"system"` behavior (follows OS preference)

### 5.2 Malformed JSON in localStorage falls back to system

**Steps:**

1. Navigate to `/`
2. Set localStorage key `"theme"` to `not-valid-json{{{`
3. Reload the page

**Expected:**

- The app does not crash
- The theme falls back to `"system"` behavior
