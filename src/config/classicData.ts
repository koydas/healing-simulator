/**
 * Raw WoW Classic (patch 1.12) data — levels 1 to 60.
 *
 * This file holds ONLY sourced values and the official formulas that combine
 * them. Game-design choices (boss profile, event cadence, experience rewards)
 * live in `gameConfig.ts`, never here.
 *
 * Sources — see `docs/classic-stats.md` for details and links:
 *   - base health / mana per class and level: `player_classlevelstats` table
 *     (MaNGOS Zero, vanilla 1.12 database).
 *   - attributes per race/class/level: `player_levelstats` table (same source).
 *   - experience required per level: `player_xp_for_level` table (same source).
 *   - attribute → health / mana formulas: `Player::GetHealthBonusFromStamina`
 *     and `Player::GetManaBonusFromIntellect` (mangoszero/server, StatSystem.cpp).
 *   - priest healing spells: rank 1 values (wowclassicdb / EZDownRank).
 *   - level 1 creatures: `creature_template` table (same vanilla database).
 */

/** Character classes (Blizzard identifiers). */
export type ClassId = 'warrior' | 'paladin' | 'hunter' | 'rogue' | 'priest' | 'mage';

/** Playable races used by the party. */
export type RaceId = 'human' | 'dwarf' | 'nightElf' | 'gnome';

export interface Attributes {
  strength: number;
  agility: number;
  stamina: number;
  intellect: number;
  spirit: number;
}

export interface ClassBaseStats {
  baseHealth: number;
  baseMana: number;
}

/** Vanilla level cap: the game stops at 60, and so does this project. */
export const MAX_LEVEL = 60;

/* -------------------------------------------------------------------------- */
/* Base health and mana per class, level 1 to 60                               */
/* -------------------------------------------------------------------------- */

/** `[basehp, basemana]` rows, in level order, straight from the SQL dump. */
function classTable(rows: readonly (readonly [number, number])[]): readonly ClassBaseStats[] {
  return rows.map(([baseHealth, baseMana]) => ({ baseHealth, baseMana }));
}

/**
 * `player_classlevelstats` (class, level, basehp, basemana), index 0 = level 1.
 * Warriors and rogues use no mana (rage / energy).
 *
 * The few non-monotonic rows (warrior 101 → 100 at level 11, paladin 28 → 26 at
 * level 2) are in the source table as well: they are copied, not smoothed.
 */
export const CLASS_BASE_BY_LEVEL: Record<ClassId, readonly ClassBaseStats[]> = {
  warrior: classTable([
    [20, 0], [29, 0], [38, 0], [47, 0], [56, 0], // 1-5
    [65, 0], [74, 0], [83, 0], [92, 0], [101, 0], // 6-10
    [100, 0], [109, 0], [118, 0], [128, 0], [139, 0], // 11-15
    [151, 0], [154, 0], [168, 0], [168, 0], [199, 0], // 16-20
    [206, 0], [224, 0], [243, 0], [253, 0], [274, 0], // 21-25
    [296, 0], [309, 0], [333, 0], [348, 0], [374, 0], // 26-30
    [401, 0], [419, 0], [448, 0], [468, 0], [499, 0], // 31-35
    [521, 0], [545, 0], [581, 0], [609, 0], [649, 0], // 36-40
    [681, 0], [715, 0], [761, 0], [799, 0], [839, 0], // 41-45
    [881, 0], [935, 0], [981, 0], [1029, 0], [1079, 0], // 46-50
    [1131, 0], [1185, 0], [1241, 0], [1299, 0], [1359, 0], // 51-55
    [1421, 0], [1485, 0], [1551, 0], [1619, 0], [1689, 0], // 56-60
  ]),
  paladin: classTable([
    [28, 59], [26, 64], [34, 84], [42, 90], [50, 112], // 1-5
    [58, 120], [66, 129], [84, 154], [92, 165], [100, 192], // 6-10
    [108, 205], [116, 219], [124, 249], [132, 265], [131, 282], // 11-15
    [141, 315], [152, 334], [164, 354], [177, 390], [191, 412], // 16-20
    [206, 435], [222, 459], [239, 499], [247, 525], [266, 552], // 21-25
    [286, 579], [307, 621], [329, 648], [342, 675], [366, 702], // 26-30
    [391, 729], [407, 756], [434, 798], [462, 825], [481, 852], // 31-35
    [511, 879], [542, 906], [564, 933], [597, 960], [621, 987], // 36-40
    [656, 1014], [682, 1041], [719, 1068], [747, 1110], [786, 1137], // 41-45
    [816, 1164], [857, 1176], [889, 1203], [922, 1230], [966, 1257], // 46-50
    [1001, 1284], [1037, 1311], [1084, 1338], [1122, 1365], [1161, 1392], // 51-55
    [1201, 1419], [1252, 1446], [1294, 1458], [1337, 1485], [1381, 1512], // 56-60
  ]),
  hunter: classTable([
    [26, 63], [33, 70], [40, 91], [57, 98], [64, 121], // 1-5
    [71, 130], [78, 155], [85, 166], [92, 193], [109, 206], // 6-10
    [116, 235], [123, 250], [130, 266], [138, 298], [147, 316], // 11-15
    [157, 350], [168, 370], [180, 391], [193, 428], [207, 451], // 16-20
    [222, 475], [238, 515], [255, 541], [273, 568], [292, 611], // 21-25
    [312, 640], [333, 670], [355, 715], [378, 745], [402, 775], // 26-30
    [417, 805], [443, 850], [470, 880], [498, 910], [527, 940], // 31-35
    [547, 970], [578, 1015], [610, 1045], [643, 1075], [667, 1105], // 36-40
    [702, 1135], [738, 1180], [775, 1210], [803, 1240], [842, 1270], // 41-45
    [872, 1300], [913, 1330], [955, 1360], [988, 1390], [1032, 1420], // 46-50
    [1067, 1450], [1113, 1480], [1150, 1510], [1198, 1540], [1237, 1570], // 51-55
    [1287, 1600], [1328, 1630], [1370, 1660], [1423, 1690], [1467, 1720], // 56-60
  ]),
  rogue: classTable([
    [25, 0], [32, 0], [49, 0], [56, 0], [63, 0], // 1-5
    [80, 0], [87, 0], [104, 0], [111, 0], [118, 0], // 6-10
    [125, 0], [142, 0], [149, 0], [156, 0], [173, 0], // 11-15
    [181, 0], [190, 0], [200, 0], [221, 0], [233, 0], // 16-20
    [246, 0], [260, 0], [275, 0], [301, 0], [318, 0], // 21-25
    [336, 0], [355, 0], [375, 0], [396, 0], [428, 0], // 26-30
    [451, 0], [475, 0], [500, 0], [526, 0], [553, 0], // 31-35
    [581, 0], [610, 0], [640, 0], [671, 0], [703, 0], // 36-40
    [736, 0], [770, 0], [805, 0], [841, 0], [878, 0], // 41-45
    [916, 0], [955, 0], [995, 0], [1026, 0], [1068, 0], // 46-50
    [1111, 0], [1155, 0], [1200, 0], [1246, 0], [1283, 0], // 51-55
    [1331, 0], [1380, 0], [1430, 0], [1471, 0], [1523, 0], // 56-60
  ]),
  priest: classTable([
    [31, 110], [37, 165], [42, 189], [57, 200], [72, 197], // 1-5
    [77, 210], [92, 224], [107, 239], [112, 255], [127, 272], // 6-10
    [132, 275], [147, 294], [162, 314], [167, 320], [182, 342], // 11-15
    [187, 365], [202, 389], [217, 399], [222, 425], [237, 437], // 16-20
    [242, 465], [258, 494], [265, 509], [283, 540], [292, 557], // 21-25
    [312, 590], [333, 609], [345, 644], [368, 665], [382, 687], // 26-30
    [407, 725], [423, 749], [450, 788], [468, 812], [497, 836], // 31-35
    [517, 860], [538, 899], [570, 923], [593, 947], [627, 971], // 36-40
    [652, 1010], [688, 1034], [715, 1058], [753, 1082], [782, 1106], // 41-45
    [812, 1130], [853, 1154], [885, 1178], [918, 1202], [962, 1226], // 46-50
    [997, 1250], [1043, 1274], [1080, 1298], [1118, 1322], [1167, 1331], // 51-55
    [1207, 1355], [1248, 1379], [1290, 1403], [1343, 1412], [1387, 1436], // 56-60
  ]),
  mage: classTable([
    [31, 100], [37, 170], [42, 181], [57, 178], [72, 191], // 1-5
    [87, 205], [92, 220], [107, 221], [122, 238], [127, 256], // 6-10
    [142, 275], [157, 280], [162, 301], [177, 323], [192, 331], // 11-15
    [197, 355], [212, 365], [227, 391], [232, 403], [247, 431], // 16-20
    [262, 445], [267, 475], [282, 491], [288, 523], [305, 541], // 21-25
    [323, 575], [332, 595], [352, 616], [363, 652], [385, 673], // 26-30
    [408, 694], [422, 730], [447, 751], [463, 772], [490, 793], // 31-35
    [508, 814], [537, 850], [567, 871], [588, 892], [620, 913], // 36-40
    [643, 934], [677, 955], [702, 976], [738, 997], [765, 1018], // 41-45
    [803, 1039], [832, 1060], [872, 1081], [903, 1102], [945, 1108], // 46-50
    [978, 1129], [1022, 1150], [1057, 1171], [1093, 1177], [1140, 1198], // 51-55
    [1178, 1219], [1227, 1225], [1267, 1246], [1318, 1252], [1360, 1273], // 56-60
  ]),
};

export function getClassBase(classId: ClassId, level: number): ClassBaseStats {
  const table = CLASS_BASE_BY_LEVEL[classId];
  const stats = table[level - 1];
  if (!stats) {
    throw new Error(`No class base stats for ${classId} at level ${level}`);
  }
  return stats;
}

/* -------------------------------------------------------------------------- */
/* Starting attributes per race, class and level                               */
/* -------------------------------------------------------------------------- */

/** `[str, agi, sta, int, spi]` rows, in level order, straight from the SQL dump. */
function attributeTable(
  rows: readonly (readonly [number, number, number, number, number])[],
): readonly Attributes[] {
  return rows.map(([strength, agility, stamina, intellect, spirit]) => ({
    strength,
    agility,
    stamina,
    intellect,
    spirit,
  }));
}

/**
 * `player_levelstats` (race, class, level, str, agi, sta, inte, spi),
 * index 0 = level 1.
 *
 * The five combinations the party is built from carry every level up to 60;
 * the others keep the level 1 row they have always had. Adding a race or class
 * to the party therefore means extending its list from the same SQL file first
 * — `getAttributes` refuses to guess (see `docs/classic-stats.md`).
 */
export const RACE_CLASS_ATTRIBUTES: Record<string, readonly Attributes[]> = {
  /* Party combinations — every level from 1 to 60. */
  'dwarf/warrior': attributeTable([
    [25, 16, 25, 19, 19], [26, 17, 26, 19, 19], [27, 17, 27, 19, 20], [28, 18, 28, 19, 20], // 1-4
    [30, 19, 29, 19, 20], [31, 20, 30, 20, 20], [32, 20, 31, 20, 21], [33, 21, 32, 20, 21], // 5-8
    [34, 22, 33, 20, 21], [35, 22, 34, 20, 22], [37, 23, 36, 20, 22], [38, 24, 37, 20, 22], // 9-12
    [39, 25, 38, 20, 23], [41, 26, 39, 21, 23], [42, 26, 40, 21, 23], [43, 27, 41, 21, 24], // 13-16
    [44, 28, 43, 21, 24], [46, 29, 44, 21, 24], [47, 30, 45, 21, 25], [49, 31, 46, 21, 25], // 17-20
    [50, 31, 48, 22, 25], [51, 32, 49, 22, 26], [53, 33, 50, 22, 26], [54, 34, 52, 22, 27], // 21-24
    [56, 35, 53, 22, 27], [57, 36, 54, 22, 27], [59, 37, 56, 22, 28], [60, 38, 57, 23, 28], // 25-28
    [62, 39, 59, 23, 29], [64, 40, 60, 23, 29], [65, 41, 61, 23, 29], [67, 42, 63, 23, 30], // 29-32
    [68, 43, 64, 23, 30], [70, 44, 66, 24, 31], [72, 45, 67, 24, 31], [74, 46, 69, 24, 32], // 33-36
    [75, 47, 71, 24, 32], [77, 48, 72, 24, 32], [79, 49, 74, 25, 33], [81, 50, 75, 25, 33], // 37-40
    [82, 52, 77, 25, 34], [84, 53, 79, 25, 34], [86, 54, 80, 25, 35], [88, 55, 82, 25, 35], // 41-44
    [90, 56, 84, 26, 36], [92, 57, 86, 26, 36], [94, 59, 87, 26, 37], [96, 60, 89, 26, 37], // 45-48
    [98, 61, 91, 27, 38], [100, 62, 93, 27, 38], [102, 64, 95, 27, 39], [104, 65, 97, 27, 39], // 49-52
    [106, 66, 99, 27, 40], [108, 68, 101, 28, 41], [111, 69, 103, 28, 41], [113, 70, 105, 28, 42], // 53-56
    [115, 72, 107, 28, 42], [117, 73, 109, 29, 43], [120, 75, 111, 29, 43], [122, 76, 113, 29, 44], // 57-60
  ]),
  'human/priest': attributeTable([
    [20, 20, 20, 22, 24], [20, 20, 20, 23, 25], [20, 20, 21, 24, 26], [21, 21, 21, 25, 28], // 1-4
    [21, 21, 21, 27, 29], [21, 21, 22, 28, 30], [21, 21, 22, 29, 31], [21, 22, 22, 30, 32], // 5-8
    [21, 22, 23, 31, 34], [22, 22, 23, 33, 35], [22, 22, 24, 34, 36], [22, 23, 24, 35, 38], // 9-12
    [22, 23, 24, 36, 39], [22, 23, 25, 38, 40], [23, 23, 25, 39, 43], [23, 24, 26, 40, 44], // 13-16
    [23, 24, 26, 42, 45], [23, 24, 26, 43, 47], [23, 25, 27, 44, 48], [24, 25, 27, 46, 50], // 17-20
    [24, 25, 28, 47, 51], [24, 25, 28, 49, 53], [24, 26, 29, 50, 54], [25, 26, 29, 52, 56], // 21-24
    [25, 26, 30, 53, 57], [25, 27, 30, 55, 59], [25, 27, 30, 56, 61], [25, 27, 31, 58, 63], // 25-28
    [26, 28, 31, 59, 65], [26, 28, 32, 61, 67], [26, 28, 32, 63, 68], [26, 29, 33, 64, 70], // 29-32
    [27, 29, 33, 66, 72], [27, 29, 34, 68, 73], [27, 30, 34, 69, 75], [28, 30, 35, 71, 77], // 33-36
    [28, 30, 36, 73, 79], [28, 31, 36, 75, 81], [28, 31, 37, 76, 84], [29, 31, 37, 78, 85], // 37-40
    [29, 32, 38, 80, 87], [29, 32, 38, 82, 89], [29, 33, 39, 84, 91], [30, 33, 39, 86, 93], // 41-44
    [30, 33, 40, 88, 95], [30, 34, 41, 90, 97], [31, 34, 41, 92, 99], [31, 35, 42, 94, 102], // 45-48
    [31, 35, 43, 96, 105], [32, 35, 43, 98, 107], [32, 36, 44, 100, 109], [32, 36, 44, 102, 111], // 49-52
    [33, 37, 45, 104, 113], [33, 37, 46, 106, 116], [33, 38, 46, 109, 118], [34, 38, 47, 111, 120], // 53-56
    [34, 39, 48, 113, 123], [34, 39, 49, 115, 126], [35, 40, 49, 118, 129], [35, 40, 50, 120, 131], // 57-60
  ]),
  'human/rogue': attributeTable([
    [21, 23, 21, 20, 20], [22, 24, 22, 20, 21], [22, 25, 22, 20, 22], [23, 27, 23, 21, 22], // 1-4
    [24, 28, 24, 21, 22], [24, 29, 24, 21, 23], [25, 31, 25, 21, 23], [26, 32, 25, 21, 23], // 5-8
    [27, 33, 26, 21, 24], [27, 35, 27, 22, 24], [28, 36, 28, 22, 25], [29, 37, 28, 22, 25], // 9-12
    [30, 39, 29, 22, 25], [30, 40, 30, 22, 26], [31, 42, 30, 23, 26], [32, 43, 31, 23, 27], // 13-16
    [33, 44, 32, 23, 27], [34, 46, 33, 23, 27], [35, 48, 33, 23, 28], [35, 49, 34, 24, 28], // 17-20
    [36, 51, 35, 24, 29], [37, 52, 36, 24, 29], [38, 54, 37, 24, 30], [39, 55, 37, 25, 30], // 21-24
    [40, 57, 38, 25, 31], [41, 59, 39, 25, 31], [42, 60, 40, 25, 31], [43, 62, 41, 25, 32], // 25-28
    [43, 64, 42, 26, 32], [44, 66, 42, 26, 33], [45, 67, 43, 26, 33], [46, 69, 44, 26, 34], // 29-32
    [47, 71, 45, 27, 34], [48, 73, 46, 27, 35], [49, 75, 47, 27, 35], [51, 77, 48, 28, 36], // 33-36
    [52, 78, 49, 28, 37], [53, 80, 50, 28, 37], [54, 82, 51, 28, 38], [55, 84, 52, 29, 38], // 37-40
    [56, 86, 53, 29, 39], [57, 88, 54, 29, 39], [58, 90, 55, 29, 40], [59, 93, 56, 30, 40], // 41-44
    [61, 95, 57, 30, 42], [62, 97, 58, 30, 43], [63, 99, 59, 31, 43], [64, 101, 60, 31, 44], // 45-48
    [65, 103, 62, 31, 45], [67, 106, 63, 32, 45], [68, 108, 64, 32, 46], [69, 110, 65, 32, 46], // 49-52
    [70, 113, 66, 33, 47], [72, 115, 67, 33, 48], [73, 117, 69, 33, 48], [74, 120, 70, 34, 49], // 53-56
    [76, 122, 71, 34, 50], [77, 125, 72, 34, 51], [79, 127, 74, 35, 51], [80, 130, 75, 35, 52], // 57-60
  ]),
  'gnome/mage': attributeTable([
    [15, 23, 19, 26, 22], [15, 23, 19, 28, 23], [15, 23, 20, 29, 24], [15, 24, 20, 32, 25], // 1-4
    [15, 24, 20, 33, 27], [16, 24, 20, 34, 28], [16, 24, 21, 35, 29], [16, 24, 21, 36, 30], // 5-8
    [16, 24, 21, 38, 31], [16, 25, 22, 39, 33], [16, 25, 22, 40, 34], [16, 25, 22, 42, 35], // 9-12
    [16, 25, 23, 43, 36], [17, 25, 23, 44, 38], [17, 26, 23, 46, 39], [17, 26, 24, 47, 40], // 13-16
    [17, 26, 24, 48, 42], [17, 26, 24, 50, 43], [17, 26, 25, 51, 44], [17, 27, 25, 54, 46], // 17-20
    [18, 27, 25, 55, 47], [18, 27, 26, 57, 49], [18, 27, 26, 58, 50], [18, 28, 27, 60, 52], // 21-24
    [18, 28, 27, 61, 53], [18, 28, 27, 63, 55], [18, 28, 28, 65, 56], [19, 28, 28, 66, 58], // 25-28
    [19, 29, 29, 68, 59], [19, 29, 29, 70, 61], [19, 29, 29, 71, 63], [19, 29, 30, 74, 64], // 29-32
    [19, 30, 30, 76, 66], [20, 30, 31, 77, 68], [20, 30, 31, 79, 69], [20, 31, 32, 81, 71], // 33-36
    [20, 31, 32, 83, 73], [20, 31, 32, 85, 75], [21, 31, 33, 87, 76], [21, 32, 33, 88, 78], // 37-40
    [21, 32, 34, 90, 80], [21, 32, 34, 92, 82], [21, 32, 35, 95, 84], [21, 33, 35, 97, 86], // 41-44
    [22, 33, 36, 99, 88], [22, 33, 36, 101, 90], [22, 34, 37, 103, 92], [22, 34, 37, 106, 94], // 45-48
    [23, 34, 38, 108, 96], [23, 35, 38, 110, 98], [23, 35, 39, 112, 100], [23, 35, 39, 114, 102], // 49-52
    [23, 36, 40, 117, 104], [24, 36, 41, 120, 106], [24, 36, 41, 122, 109], [24, 37, 42, 124, 111], // 53-56
    [24, 37, 42, 127, 113], [25, 37, 43, 129, 115], [25, 38, 43, 132, 118], [25, 38, 44, 133, 120], // 57-60
  ]),
  'nightElf/hunter': attributeTable([
    [17, 28, 20, 20, 21], [17, 29, 21, 21, 22], [18, 30, 22, 21, 22], [18, 32, 22, 22, 23], // 1-4
    [19, 33, 23, 22, 23], [19, 34, 24, 23, 24], [19, 35, 25, 23, 24], [20, 36, 26, 24, 25], // 5-8
    [20, 38, 27, 24, 26], [21, 39, 27, 25, 26], [21, 40, 28, 25, 27], [22, 42, 29, 26, 28], // 9-12
    [22, 43, 30, 27, 28], [23, 44, 31, 27, 29], [23, 46, 32, 28, 29], [24, 47, 33, 28, 30], // 13-16
    [24, 48, 34, 29, 31], [25, 50, 35, 30, 32], [25, 51, 36, 30, 32], [26, 53, 37, 31, 33], // 17-20
    [26, 54, 38, 32, 34], [27, 56, 39, 32, 34], [27, 57, 40, 33, 35], [28, 59, 41, 34, 36], // 21-24
    [28, 60, 42, 34, 37], [29, 62, 43, 35, 37], [29, 64, 44, 36, 38], [30, 65, 45, 36, 39], // 25-28
    [30, 67, 46, 37, 40], [31, 69, 47, 38, 40], [31, 70, 49, 39, 41], [32, 72, 50, 39, 42], // 29-32
    [33, 74, 51, 40, 43], [33, 75, 52, 41, 44], [34, 77, 53, 42, 45], [35, 79, 55, 43, 46], // 33-36
    [35, 81, 56, 43, 46], [36, 83, 57, 44, 47], [36, 85, 58, 45, 48], [37, 86, 60, 46, 49], // 37-40
    [38, 88, 61, 47, 50], [38, 90, 62, 47, 51], [39, 92, 63, 48, 52], [40, 94, 65, 49, 53], // 41-44
    [40, 96, 66, 50, 54], [41, 98, 68, 51, 55], [42, 100, 69, 52, 56], [43, 103, 70, 53, 57], // 45-48
    [43, 105, 72, 54, 58], [44, 107, 73, 55, 59], [45, 109, 75, 56, 60], [46, 111, 76, 57, 61], // 49-52
    [46, 113, 78, 58, 62], [47, 116, 79, 59, 63], [48, 118, 81, 60, 64], [49, 120, 82, 61, 65], // 53-56
    [50, 123, 84, 62, 67], [50, 125, 86, 63, 68], [51, 128, 87, 64, 69], [52, 130, 89, 65, 70], // 57-60
  ]),

  /* Combinations outside the party — level 1 only, as before. */
  'human/warrior': attributeTable([[23, 20, 22, 20, 21]]),
  'human/paladin': attributeTable([[22, 20, 22, 20, 22]]),
  'human/mage': attributeTable([[20, 20, 20, 23, 22]]),
  'dwarf/paladin': attributeTable([[24, 16, 25, 19, 20]]),
  'dwarf/hunter': attributeTable([[22, 19, 24, 19, 20]]),
  'dwarf/rogue': attributeTable([[23, 19, 24, 19, 19]]),
  'dwarf/priest': attributeTable([[22, 16, 23, 21, 22]]),
  'nightElf/warrior': attributeTable([[20, 25, 21, 20, 20]]),
  'nightElf/rogue': attributeTable([[18, 28, 20, 20, 20]]),
  'nightElf/priest': attributeTable([[17, 25, 19, 22, 23]]),
  'gnome/warrior': attributeTable([[18, 23, 21, 23, 20]]),
  'gnome/rogue': attributeTable([[16, 26, 20, 23, 20]]),
};

/**
 * Attributes of a race/class at a given level.
 *
 * Throws rather than interpolating: a missing row means the tables have not
 * been extended yet, and a silently invented character would poison every
 * derived health, mana and regeneration value.
 */
export function getAttributes(race: RaceId, classId: ClassId, level = 1): Attributes {
  const key = `${race}/${classId}`;
  const table = RACE_CLASS_ATTRIBUTES[key];
  if (!table) {
    throw new Error(`Unknown race/class combination: ${key}`);
  }
  const attributes = table[level - 1];
  if (!attributes) {
    throw new Error(`No attributes for ${key} at level ${level}`);
  }
  return attributes;
}

/* -------------------------------------------------------------------------- */
/* Official vanilla formulas                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Health granted by stamina.
 * The first 20 points give 1 health each, every point beyond gives 10.
 * (`Player::GetHealthBonusFromStamina`)
 */
export function healthBonusFromStamina(stamina: number): number {
  const base = Math.min(stamina, 20);
  return base + (stamina - base) * 10;
}

/**
 * Mana granted by intellect.
 * The first 20 points give 1 mana each, every point beyond gives 15.
 * (`Player::GetManaBonusFromIntellect`)
 */
export function manaBonusFromIntellect(intellect: number): number {
  const base = Math.min(intellect, 20);
  return base + (intellect - base) * 15;
}

/** Maximum health of a character at the given level. */
export function maxHealthAtLevel(
  classId: ClassId,
  attributes: Attributes,
  level: number,
): number {
  return getClassBase(classId, level).baseHealth + healthBonusFromStamina(attributes.stamina);
}

/** Maximum mana of a character at the given level (0 for classes without mana). */
export function maxManaAtLevel(classId: ClassId, attributes: Attributes, level: number): number {
  const base = getClassBase(classId, level).baseMana;
  if (base <= 0) return 0;
  return base + manaBonusFromIntellect(attributes.intellect);
}

/** Maximum health of a level 1 character. */
export function maxHealthAtLevel1(classId: ClassId, attributes: Attributes): number {
  return maxHealthAtLevel(classId, attributes, 1);
}

/** Maximum mana of a level 1 character (0 for classes without mana). */
export function maxManaAtLevel1(classId: ClassId, attributes: Attributes): number {
  return maxManaAtLevel(classId, attributes, 1);
}

/* -------------------------------------------------------------------------- */
/* Experience per level                                                        */
/* -------------------------------------------------------------------------- */

/**
 * `player_xp_for_level` (lvl, xp_for_next_level), index 0 = level 1.
 *
 * The table stops at level 59 here: the row for 60 exists in the dump but a
 * level 60 character never spends it, and keeping it would let `xpToNextLevel`
 * pretend the cap can be crossed. Levels 1 → 60 add up to 4,084,700 experience.
 */
export const XP_TO_NEXT_LEVEL: readonly number[] = [
  400, 900, 1400, 2100, 2800, // 1-5
  3600, 4500, 5400, 6500, 7600, // 6-10
  8800, 10100, 11400, 12900, 14400, // 11-15
  16000, 17700, 19400, 21300, 23200, // 16-20
  25200, 27300, 29400, 31700, 34000, // 21-25
  36400, 38900, 41400, 44300, 47400, // 26-30
  50800, 54500, 58600, 62800, 67100, // 31-35
  71600, 76100, 80800, 85700, 90700, // 36-40
  95800, 101000, 106300, 111800, 117500, // 41-45
  123200, 129100, 135100, 141200, 147500, // 46-50
  153900, 160400, 167100, 173900, 180800, // 51-55
  187900, 195000, 202300, 209800, // 56-59
];

/**
 * Experience needed to reach the next level, or `null` at the level cap.
 * Throws for a level outside [1, MAX_LEVEL]: a corrupt saved profile must fail
 * where it is loaded, not silently level a character up forever.
 */
export function xpToNextLevel(level: number): number | null {
  if (!Number.isInteger(level) || level < 1 || level > MAX_LEVEL) {
    throw new Error(`Level out of range: ${level}`);
  }
  return level === MAX_LEVEL ? null : XP_TO_NEXT_LEVEL[level - 1];
}
/* -------------------------------------------------------------------------- */
/* Mana regeneration                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Vanilla out-of-combat mana regeneration:
 *   - it lands in 2-second ticks;
 *   - the "five-second rule" (5SR) fully suspends the spirit-based part for
 *     5 seconds after any mana expenditure.
 *
 * The exact coefficient lives in the `gtRegenMPPerSpt` DBC (not public) and
 * depends on both class AND level. We use the commonly documented priest
 * formula — the only *approximated* value in this file, flagged as such in
 * `docs/classic-stats.md`.
 */
export const MANA_REGEN_VANILLA = {
  tickMs: 2000,
  fiveSecondRuleMs: 5000,
  /** mana per 2s tick = spirit / 4 + 12.5 (priest) */
  spiritDivisor: 4,
  flatBonus: 12.5,
} as const;

export function manaPerTickFromSpirit(spirit: number): number {
  return spirit / MANA_REGEN_VANILLA.spiritDivisor + MANA_REGEN_VANILLA.flatBonus;
}

/* -------------------------------------------------------------------------- */
/* Priest healing spells — rank 1 values                                       */
/* -------------------------------------------------------------------------- */

export interface PriestHealRank {
  /** Blizzard spell id, so the source can be looked up. */
  spellId: number;
  name: string;
  rank: number;
  /** Level at which the priest learns this rank. */
  requiredLevel: number;
  manaCost: number;
  castTimeMs: number;
  /** Minimum / maximum direct healing (0 for a HoT). */
  healMin: number;
  healMax: number;
  /** Total HoT healing and its tick cadence (0 for a direct heal). */
  hotTotalHeal: number;
  hotTicks: number;
  hotIntervalMs: number;
  /** Single target or whole party. */
  targetsParty: boolean;
}

/**
 * The five vanilla priest healing families, at rank 1.
 * `requiredLevel` is the real training level: at level 1 only Lesser Heal is
 * available (see ADR-0008).
 */
export const PRIEST_HEALS_RANK_1: Record<string, PriestHealRank> = {
  lesserHeal: {
    spellId: 2050,
    name: 'Lesser Heal',
    rank: 1,
    requiredLevel: 1,
    manaCost: 30,
    castTimeMs: 1500,
    healMin: 46,
    healMax: 56,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: false,
  },
  renew: {
    spellId: 139,
    name: 'Renew',
    rank: 1,
    requiredLevel: 8,
    manaCost: 30,
    castTimeMs: 0,
    healMin: 0,
    healMax: 0,
    hotTotalHeal: 45,
    hotTicks: 5,
    hotIntervalMs: 3000,
    targetsParty: false,
  },
  heal: {
    spellId: 2054,
    name: 'Heal',
    rank: 1,
    requiredLevel: 16,
    manaCost: 155,
    castTimeMs: 3000,
    healMin: 295,
    healMax: 341,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: false,
  },
  flashHeal: {
    spellId: 2061,
    name: 'Flash Heal',
    rank: 1,
    requiredLevel: 20,
    manaCost: 125,
    castTimeMs: 1500,
    healMin: 193,
    healMax: 237,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: false,
  },
  prayerOfHealing: {
    spellId: 596,
    name: 'Prayer of Healing',
    rank: 1,
    requiredLevel: 30,
    manaCost: 410,
    castTimeMs: 3000,
    healMin: 312,
    healMax: 333,
    hotTotalHeal: 0,
    hotTicks: 0,
    hotIntervalMs: 0,
    targetsParty: true,
  },
};

/** Vanilla global cooldown, identical for every healing spell. */
export const GLOBAL_COOLDOWN_MS = 1500;

/* -------------------------------------------------------------------------- */
/* Level 1 creatures                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Measured over the 597 "real" level 1 creatures of `creature_template`
 * (triggers and shapeshift forms excluded):
 *   - melee damage: median 2, third quartile 9-10;
 *   - health: median 64;
 *   - attack speed: 2000 ms.
 *
 * Elite factor measured on the same data, comparing rank 0 and rank 1 at equal
 * level: ×1.2 at level 20, then roughly ×3 from level 30 upwards (health goes
 * ×1.6 to ×3).
 */
export const CREATURE_LEVEL_1 = {
  meleeDamageMedian: 2,
  meleeDamageHighEnd: 10,
  meleeAttackTimeMs: 2000,
  healthMedian: 64,
} as const;

export const ELITE_DAMAGE_FACTOR_MEASURED = {
  level20: 1.24,
  level30: 3.11,
  level40: 3.27,
  level50: 3.22,
  level60: 2.9,
} as const;
