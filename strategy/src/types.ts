export interface Tile { entity: string; name?: string; template?: string; ptz?: string }
export interface Room { id: string; area: string; title: string; icon: string; extra: string[]; members: string[] }
export interface Layout {
  favorites: Tile[]; rooms: Room[]; cameras: Tile[]; doors: string[];
  lock: string | null; climate: string | null; weather: string | null; forecast_sensor: string | null;
  media_exclude: string[]; kiosk_users: string[]; camera_card: "advanced" | "picture"; overview_path: string;
}
export interface Hass {
  areas: Record<string, { area_id: string; name: string; icon?: string | null }>;
  devices: Record<string, { id: string; area_id?: string | null }>;
  entities: Record<string, { entity_id: string; device_id?: string | null; area_id?: string | null; hidden?: boolean; entity_category?: string | null }>;
  states: Record<string, { state: string; attributes: Record<string, unknown> }>;
  callWS?: (msg: unknown) => Promise<unknown>;
}
export type Options = Partial<Omit<Layout, "rooms" | "favorites" | "cameras">> & {
  rooms?: Array<Partial<Room> & { area: string }>; favorites?: Array<string | Tile>; cameras?: Array<string | Tile>;
};
export const DEFAULT_MEDIA_EXCLUDE = ["media_player.this_device*", "media_player.everywhere"];
export const RESERVED_IDS = ["aspect-ratio", "card", "container", "img-cell", "icon", "name", "state", "label", "lock", "overlay"];
