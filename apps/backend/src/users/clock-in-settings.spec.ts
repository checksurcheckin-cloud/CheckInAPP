import { enablesClockIn, resolveClockInSettings } from './clock-in-settings';

describe('clock-in settings', () => {
  it('treats only true or a reset to the company default as (re)enabling (décision #38)', () => {
    expect(enablesClockIn({ gpsClockInEnabled: false })).toBe(false);
    expect(enablesClockIn({ mobileClockInEnabled: false, gpsClockInEnabled: false })).toBe(false);
    expect(enablesClockIn({})).toBe(false);
    expect(enablesClockIn({ gpsClockInEnabled: true })).toBe(true);
    expect(enablesClockIn({ mobileClockInEnabled: null })).toBe(true);
  });

  it('resolves each setting independently, user override first', () => {
    expect(
      resolveClockInSettings({
        gpsClockInEnabled: null,
        mobileClockInEnabled: false,
        company: { gpsClockInEnabled: true, mobileClockInEnabled: true },
      }),
    ).toEqual({ mobileClockInEnabled: false, gpsClockInEnabled: true });
  });
});
