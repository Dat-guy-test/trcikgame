/** Contract table as data. See docs/rules.md (contracts). */
import type { BonusKind } from './scoring';

export type ContractId =
  | 'rufer'
  | 'solo'
  | 'besser_rufer'
  | 'dreier'
  | 'solodreier'
  | 'sechsendreier'
  | 'farbendreier'
  | 'farbensolo'
  | 'bettel'
  | 'piccolo'
  | 'zwiccolo'
  | 'bettel_ouvert'
  | 'piccolo_ouvert'
  | 'trischaken';

export type TeamStructure = 'twoVsTwo' | 'oneVsThree' | 'allAlone';
export type BonusAccess = 'all' | 'allButKonigUltimo' | 'valatOnly' | 'none';

export interface ContractDef {
  id: ContractId;
  /** Base value when the declarer side wins (and the bid value for ordering). */
  value: number;
  /** Base value when the declarer side loses (Sechsendreier: 4). */
  loss: number;
  teams: TeamStructure;
  /** Declarer names a king and plays with its holder. */
  calledKing: boolean;
  /** Maximum cards taken from the Talon (0, 3 or 6). Also the default `take`. */
  take: 0 | 3 | 6;
  farben: boolean;
  /** For negative contracts: exact number of tricks the declarer must win. */
  negativeTricks: number | null;
  ouvert: boolean;
  /** Only the starting player may bid it. */
  starterOnly: boolean;
  /** Bidder must declare at least one bonus (Besser Rufer). */
  needsBonusDeclaration: boolean;
  bonuses: BonusAccess;
  contra: boolean;
  biddable: boolean;
  /** Points each of the three other seats receives when the declarer gives up (king in the Talon). */
  giveUpPerOpponent: number;
}

const base = {
  calledKing: false,
  take: 0,
  farben: false,
  negativeTricks: null,
  ouvert: false,
  starterOnly: false,
  needsBonusDeclaration: false,
  contra: true,
  biddable: true,
  giveUpPerOpponent: 0,
} as const;

function def(d: Partial<ContractDef> & Pick<ContractDef, 'id' | 'value' | 'teams' | 'bonuses'>): ContractDef {
  return { ...base, loss: d.value, ...d } as ContractDef;
}

export const CONTRACTS: Readonly<Record<ContractId, ContractDef>> = {
  rufer: def({ id: 'rufer', value: 1, teams: 'twoVsTwo', calledKing: true, take: 3, starterOnly: true, bonuses: 'all', contra: false, giveUpPerOpponent: 1 }),
  solo: def({ id: 'solo', value: 2, teams: 'twoVsTwo', calledKing: true, take: 0, bonuses: 'all', contra: false, giveUpPerOpponent: 2 }),
  besser_rufer: def({ id: 'besser_rufer', value: 1, teams: 'twoVsTwo', calledKing: true, take: 3, needsBonusDeclaration: true, bonuses: 'all', contra: false, giveUpPerOpponent: 4 }),
  dreier: def({ id: 'dreier', value: 4, teams: 'oneVsThree', take: 3, bonuses: 'allButKonigUltimo' }),
  solodreier: def({ id: 'solodreier', value: 8, teams: 'oneVsThree', take: 0, bonuses: 'allButKonigUltimo' }),
  sechsendreier: def({ id: 'sechsendreier', value: 2, loss: 4, teams: 'oneVsThree', take: 6, bonuses: 'allButKonigUltimo' }),
  farbendreier: def({ id: 'farbendreier', value: 3, teams: 'oneVsThree', take: 3, farben: true, bonuses: 'valatOnly' }),
  farbensolo: def({ id: 'farbensolo', value: 6, teams: 'oneVsThree', take: 0, farben: true, bonuses: 'valatOnly' }),
  bettel: def({ id: 'bettel', value: 3, teams: 'oneVsThree', negativeTricks: 0, bonuses: 'none' }),
  piccolo: def({ id: 'piccolo', value: 2, teams: 'oneVsThree', negativeTricks: 1, bonuses: 'none' }),
  zwiccolo: def({ id: 'zwiccolo', value: 2, teams: 'oneVsThree', negativeTricks: 2, bonuses: 'none' }),
  bettel_ouvert: def({ id: 'bettel_ouvert', value: 6, teams: 'oneVsThree', negativeTricks: 0, ouvert: true, bonuses: 'none' }),
  piccolo_ouvert: def({ id: 'piccolo_ouvert', value: 5, teams: 'oneVsThree', negativeTricks: 1, ouvert: true, bonuses: 'none' }),
  trischaken: def({ id: 'trischaken', value: 0, teams: 'allAlone', bonuses: 'none', contra: false, biddable: false }),
};

export const isNegative = (c: ContractDef): boolean => c.negativeTricks !== null || c.id === 'trischaken';

export const ALL_BONUSES: readonly BonusKind[] = [
  'trull', 'vierKonige', 'mondfang', 'skusfang', 'konigUltimo', 'pagatUltimo', 'uhu', 'kakadu', 'marabu',
];

/** Bonuses (other than Valat) that can be declared or won in this contract. */
export function allowedBonuses(c: ContractDef): BonusKind[] {
  switch (c.bonuses) {
    case 'all': return [...ALL_BONUSES];
    case 'allButKonigUltimo': return ALL_BONUSES.filter((b) => b !== 'konigUltimo');
    default: return [];
  }
}

/** Valat is available in every contract that has any bonuses (including Farben). */
export const valatAllowed = (c: ContractDef): boolean => c.bonuses !== 'none';
