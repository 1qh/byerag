interface KindRow {
  kind?: UserKind
}
type UserKind = 'real' | 'test'
const profileKind = (row: KindRow): UserKind => row.kind ?? 'real'
const isRealProfile = (row: KindRow): boolean => profileKind(row) === 'real'
const filterRealProfiles = <T extends KindRow>(rows: T[]): T[] => rows.filter(r => isRealProfile(r))
export { filterRealProfiles, isRealProfile, profileKind }
export type { KindRow, UserKind }
