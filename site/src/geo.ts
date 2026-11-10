/** Offline reverse geocoding against GeoNames cities15000, served from this site. */
interface Cities {
  names: string[];
  countries: string[];
  lat: Float32Array;
  lon: Float32Array;
  countryNames: Record<string, string>;
}

let loading: Promise<Cities> | undefined;

export function loadCities(): Promise<Cities> {
  loading ??= fetch('/geo/cities.tsv')
    .then((r) => {
      if (!r.ok) throw new Error(`cities.tsv: HTTP ${r.status}`);
      return r.text();
    })
    .then(parse);
  loading.catch(() => (loading = undefined));
  return loading;
}

function parse(text: string): Cities {
  const lines = text.split('\n');
  let countryNames: Record<string, string> = {};
  const rows = lines.filter((l) => {
    if (l.startsWith('#countries\t')) countryNames = JSON.parse(l.slice(11));
    return l && !l.startsWith('#');
  });
  const c: Cities = { names: [], countries: [], lat: new Float32Array(rows.length), lon: new Float32Array(rows.length), countryNames };
  rows.forEach((l, i) => {
    const [name, cc, la, lo] = l.split('\t');
    c.names.push(name);
    c.countries.push(cc);
    c.lat[i] = Number(la);
    c.lon[i] = Number(lo);
  });
  return c;
}

export interface Place {
  name: string;
  country: string;
  km: number;
}

export async function nearestPlace(lat: number, lon: number): Promise<Place | null> {
  const c = await loadCities();
  const toRad = Math.PI / 180;
  const cosLat = Math.cos(lat * toRad);
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < c.names.length; i++) {
    const dLat = c.lat[i] - lat;
    let dLon = Math.abs(c.lon[i] - lon);
    if (dLon > 180) dLon = 360 - dLon;
    const d = dLat * dLat + dLon * cosLat * (dLon * cosLat);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  if (best < 0) return null;
  // Haversine for the reported distance.
  const p1 = lat * toRad;
  const p2 = c.lat[best] * toRad;
  const dp = p2 - p1;
  const dl = (c.lon[best] - lon) * toRad;
  const a = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
  const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return { name: c.names[best], country: c.countryNames[c.countries[best]] ?? c.countries[best], km };
}

const DIRS = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'];
export function compass(deg: number): string {
  return DIRS[Math.round((((deg % 360) + 360) % 360) / 45) % 8];
}
