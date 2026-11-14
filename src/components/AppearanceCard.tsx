import { Card, Segmented } from './ui';
import { THEME_LABEL, THEME_PREFS, type ThemePref } from '../utils/theme';

/** Settings card for the theme preference. Same state as the header toggle (owned by App). */
export function AppearanceCard({ theme, onThemeChange }: { theme: ThemePref; onThemeChange: (p: ThemePref) => void }) {
  return (
    <Card title="Appearance" subtitle="Auto follows your device setting. Saved in this browser.">
      <div className="max-w-sm">
        <Segmented<ThemePref>
          accentSelected
          ariaLabel="Appearance"
          value={theme}
          options={THEME_PREFS.map((p) => ({ value: p, label: THEME_LABEL[p] }))}
          onChange={onThemeChange}
        />
      </div>
    </Card>
  );
}
