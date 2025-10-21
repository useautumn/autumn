# Form Design Guidelines

## CSS Class System

Form elements use an atomic design system with three layers:

### 1. Base (`input-base`)
Static styling: padding, font, border, background, placeholder color.

### 2. Shadow (`input-shadow-default`)
Base shadow applied to the element.

### 3. State (`input-state-*`)
Interactive behavior - handles hover/focus/open states with appropriate shadows and borders.

- `input-state-focus` - For native inputs (`:focus`)
- `input-state-open` - For Radix components (`[data-state="open"]`)
- `input-state-focus-within` - For composite components (`:focus-within`)
- `input-state-*-tiny` - Smaller focus ring variants

## Usage

```tsx
// Standard Input
<input className="input-base input-shadow-default input-state-focus" />

// Select (Radix component)
<SelectTrigger className="input-base input-shadow-default input-state-open" />

// InputGroup (composite)
<div className="input-base input-shadow-default input-state-focus-within">
  <input />
</div>
```

## Customization

Shadow values are CSS variables in `styles/form/effects.css`. Change once, updates everywhere:
- `--input-shadow-default`
- `--input-shadow-hover`
- `--input-shadow-focus`
- `--input-shadow-focus-tiny`

## Non-form Elements

Checkboxes, buttons, and other non-input controls use inline Tailwind classes. Don't force them into the input system.

## Component Directory Structure

Form components are organized by type in folders (e.g., `inputs/`, `sheets/`, `checkboxes/`, `radio-groups/`). Within each folder, create different variants like `Input.tsx`, `LongInput.tsx`, `AreaCheckbox.tsx` based on layout changes or additional elements alongside the base component. Use separate component files when there are structural differences; use Tailwind variant classes for simple style variations.
