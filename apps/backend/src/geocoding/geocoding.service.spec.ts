import { BadGatewayException } from '@nestjs/common';
import { GeocodingService } from './geocoding.service';

describe('GeocodingService', () => {
  let service: GeocodingService;
  let fetchSpy: jest.SpyInstance;

  beforeEach(() => {
    service = new GeocodingService();
    fetchSpy = jest.spyOn(global, 'fetch' as any);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  describe('search', () => {
    it('maps Nominatim results to GeocodeCandidate[]', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => [
          { display_name: 'Grand Place, Bruxelles', lat: '50.8467', lon: '4.3525' },
          { display_name: 'invalid entry - no lat', lon: '4.3525' },
        ],
      } as Response);

      const result = await service.search('Grand Place Bruxelles');

      expect(result).toEqual([{ label: 'Grand Place, Bruxelles', lat: 50.8467, lng: 4.3525 }]);
    });

    it('throws BadGatewayException when Nominatim responds with an error', async () => {
      fetchSpy.mockResolvedValue({ ok: false, json: async () => ({}) } as Response);

      await expect(service.search('adresse introuvable')).rejects.toThrow(BadGatewayException);
    });
  });

  describe('reverse', () => {
    it('resolves a readable label from coordinates', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ display_name: 'Rue de la Loi 16, Bruxelles' }),
      } as Response);

      const label = await service.reverse(50.8467, 4.3525);

      expect(label).toBe('Rue de la Loi 16, Bruxelles');
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Fail-soft : l'écran Présence ne doit jamais planter parce que Nominatim
    // est indisponible — juste retomber sur les coordonnées brutes côté UI.
    it('returns null instead of throwing when the geocoding service fails', async () => {
      fetchSpy.mockRejectedValue(new Error('network down'));

      const label = await service.reverse(50.8467, 4.3525);

      expect(label).toBeNull();
    });

    it('caches results so a repeated lookup of the same rounded position skips the network call', async () => {
      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({ display_name: 'Rue de la Loi 16, Bruxelles' }),
      } as Response);

      await service.reverse(50.84671, 4.35251);
      await service.reverse(50.84672, 4.35252); // same rounded to 4 decimals

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });
  });
});
