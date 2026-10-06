import { BadGatewayException, Injectable, Logger } from '@nestjs/common';

export interface GeocodeCandidate {
  label: string;
  lat: number;
  lng: number;
}

interface ReverseCacheEntry {
  label: string | null;
  expiresAt: number;
}

// Géocodage direct (adresse -> coordonnées, pour la fiche d'un site) et
// inverse (coordonnées -> adresse lisible, pour l'écran Présence quand le
// site n'a pas de coordonnées enregistrées) via Nominatim (OpenStreetMap) —
// gratuit, pas de clé API, mais politique d'usage stricte (1 req/s, User-
// Agent identifiant obligatoire) : d'où le cache et le fail-soft sur reverse.
@Injectable()
export class GeocodingService {
  private readonly logger = new Logger(GeocodingService.name);
  private readonly baseUrl = 'https://nominatim.openstreetmap.org';
  // Nominatim exige un User-Agent identifiant l'application (pas le
  // User-Agent par défaut d'un navigateur/lib) — voir leur politique d'usage.
  private readonly userAgent = `CheckItApp-Horaires/1.0 (contact: ${
    process.env.GEOCODING_CONTACT_EMAIL ?? 'contact@checkitapp.app'
  })`;

  // Cache mémoire simple pour le reverse geocoding — les positions GPS d'un
  // même employé se répètent sur des rafraîchissements successifs de l'écran
  // Présence (toutes les 30s), inutile de re-appeler Nominatim à chaque fois.
  private readonly reverseCache = new Map<string, ReverseCacheEntry>();
  private readonly REVERSE_CACHE_TTL_MS = 60 * 60 * 1000; // 1h
  private readonly REVERSE_CACHE_MAX_SIZE = 500;

  async search(query: string): Promise<GeocodeCandidate[]> {
    const url = `${this.baseUrl}/search?format=jsonv2&addressdetails=0&limit=5&accept-language=fr&q=${encodeURIComponent(query)}`;
    const results = await this.fetchJson(url);
    if (!Array.isArray(results)) return [];
    return results
      .map((r: { display_name?: string; lat?: string; lon?: string }) => {
        const lat = Number(r.lat);
        const lng = Number(r.lon);
        if (!r.display_name || Number.isNaN(lat) || Number.isNaN(lng)) return null;
        return { label: r.display_name, lat, lng };
      })
      .filter((c): c is GeocodeCandidate => c !== null);
  }

  // Fail-soft volontaire : une adresse introuvable ou un souci réseau ne
  // doit jamais casser l'affichage de l'écran Présence, juste laisser
  // l'appelant retomber sur les coordonnées brutes.
  async reverse(lat: number, lng: number): Promise<string | null> {
    const cacheKey = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const cached = this.reverseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.label;
    }

    let label: string | null = null;
    try {
      const url = `${this.baseUrl}/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=18&addressdetails=0&accept-language=fr`;
      const result = await this.fetchJson(url);
      label = typeof result?.display_name === 'string' ? result.display_name : null;
    } catch (err) {
      this.logger.warn(`Reverse geocoding failed for ${cacheKey}: ${(err as Error).message}`);
    }

    if (this.reverseCache.size >= this.REVERSE_CACHE_MAX_SIZE) {
      const oldestKey = this.reverseCache.keys().next().value;
      if (oldestKey !== undefined) this.reverseCache.delete(oldestKey);
    }
    this.reverseCache.set(cacheKey, { label, expiresAt: Date.now() + this.REVERSE_CACHE_TTL_MS });
    return label;
  }

  private async fetchJson(url: string): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, { headers: { 'User-Agent': this.userAgent } });
    } catch (err) {
      throw new BadGatewayException('Service de géocodage injoignable');
    }
    if (!res.ok) {
      throw new BadGatewayException('Service de géocodage indisponible');
    }
    return res.json();
  }
}
