const gb = 1024 ** 3;
const mb = 1024 ** 2;

export const locations = [
  {
    id: 'nl-media-01',
    slug: 'nl-media-01',
    name: 'NLMedia 01',
    mountPath: '/Volumes/NLMedia 01',
    status: 'online',
    capacityBytes: 8_000 * gb,
    usedBytes: 6_240 * gb,
    scanCount: 14,
    lastScanAt: '2026-07-11T19:42:00Z'
  },
  {
    id: 'nl-backup',
    slug: 'nl-backup',
    name: 'NLBackup',
    mountPath: '/Volumes/NLBackup',
    status: 'online',
    capacityBytes: 12_000 * gb,
    usedBytes: 8_870 * gb,
    scanCount: 9,
    lastScanAt: '2026-07-10T03:18:00Z'
  },
  {
    id: 'archive-cold-02',
    slug: 'archive-cold-02',
    name: 'Archive Cold 02',
    mountPath: '/Volumes/Archive Cold 02',
    status: 'offline',
    capacityBytes: 18_000 * gb,
    usedBytes: 14_510 * gb,
    scanCount: 4,
    lastScanAt: '2026-06-28T22:04:00Z'
  }
];

export const scans = [
  {
    id: 'scan-media-live',
    locationId: 'nl-media-01',
    name: 'Jul 11, 2026 at 12:42 PM',
    shortName: 'Today, 12:42 PM',
    status: 'running',
    phase: 'metadata',
    startedAt: '2026-07-11T19:42:00Z',
    finishedAt: null,
    fileCount: 283444,
    directoryCount: 12804,
    totalBytes: 6_702_842_605_568,
    errorCount: 2,
    isRepresentative: false
  },
  {
    id: 'scan-media-representative',
    locationId: 'nl-media-01',
    name: 'Jul 8, 2026 at 1:16 AM',
    shortName: 'Jul 8, 1:16 AM',
    status: 'complete',
    phase: 'complete',
    startedAt: '2026-07-08T08:16:00Z',
    finishedAt: '2026-07-08T09:04:00Z',
    fileCount: 417892,
    directoryCount: 18422,
    totalBytes: 6_694_126_403_584,
    errorCount: 0,
    isRepresentative: true
  },
  {
    id: 'scan-media-jul-02',
    locationId: 'nl-media-01',
    name: 'Jul 2, 2026 at 11:08 PM',
    shortName: 'Jul 2, 11:08 PM',
    status: 'complete',
    phase: 'complete',
    startedAt: '2026-07-03T06:08:00Z',
    finishedAt: '2026-07-03T06:47:00Z',
    fileCount: 416305,
    directoryCount: 18391,
    totalBytes: 6_681_411_092_480,
    errorCount: 1,
    isRepresentative: false
  },
  {
    id: 'scan-backup-representative',
    locationId: 'nl-backup',
    name: 'Jul 10, 2026 at 8:18 PM',
    shortName: 'Jul 10, 8:18 PM',
    status: 'complete',
    phase: 'complete',
    startedAt: '2026-07-11T03:18:00Z',
    finishedAt: '2026-07-11T04:26:00Z',
    fileCount: 612508,
    directoryCount: 29220,
    totalBytes: 9_522_502_983_680,
    errorCount: 0,
    isRepresentative: true
  },
  {
    id: 'scan-archive-representative',
    locationId: 'archive-cold-02',
    name: 'Jun 28, 2026 at 3:04 PM',
    shortName: 'Jun 28, 3:04 PM',
    status: 'complete',
    phase: 'complete',
    startedAt: '2026-06-28T22:04:00Z',
    finishedAt: '2026-06-29T00:31:00Z',
    fileCount: 1038812,
    directoryCount: 48208,
    totalBytes: 15_579_032_739_840,
    errorCount: 6,
    isRepresentative: true
  }
];

const fileRows = [
  ['file-001', 'Brand_Film_Master_v18.mov', 'Video', 18420 * mb, '2026-07-09 18:42', 'nonlogical', 'Projects/Brand Film/Exports/Brand_Film_Master_v18.mov', 'verified', 2],
  ['file-002', 'Brand_Film_Master_v17.mov', 'Video', 18396 * mb, '2026-07-07 22:19', 'nonlogical', 'Projects/Brand Film/Exports/Archive/Brand_Film_Master_v17.mov', 'verified', 1],
  ['file-003', 'A001_C014_0617Q4.R3D', 'Video', 12680 * mb, '2026-06-17 14:06', 'nonlogical', 'Projects/Brand Film/Camera A/A001_C014_0617Q4.R3D', 'verified', 2],
  ['file-004', 'A001_C015_0617W7.R3D', 'Video', 11840 * mb, '2026-06-17 14:14', 'nonlogical', 'Projects/Brand Film/Camera A/A001_C015_0617W7.R3D', 'verified', 1],
  ['file-005', 'interview_maya_take_03.wav', 'Audio', 824 * mb, '2026-06-18 10:31', 'nonlogical', 'Projects/Brand Film/Audio/interview_maya_take_03.wav', 'verified', 3],
  ['file-006', 'interview_maya_take_04.wav', 'Audio', 911 * mb, '2026-06-18 10:49', 'nonlogical', 'Projects/Brand Film/Audio/interview_maya_take_04.wav', 'verified', 1],
  ['file-007', 'Launch_Key_Art_Final.psb', 'Image', 2840 * mb, '2026-07-08 16:12', 'studio', 'Design/Launch Campaign/Final/Launch_Key_Art_Final.psb', 'verified', 2],
  ['file-008', 'Launch_Key_Art_v32.psb', 'Image', 2784 * mb, '2026-07-06 09:55', 'studio', 'Design/Launch Campaign/Working/Launch_Key_Art_v32.psb', 'verified', 1],
  ['file-009', 'homepage-hero@2x.png', 'Image', 18.6 * mb, '2026-07-10 12:04', 'studio', 'Design/Launch Campaign/Web/homepage-hero@2x.png', 'verified', 4],
  ['file-010', 'product-grid@2x.png', 'Image', 12.4 * mb, '2026-07-10 12:08', 'studio', 'Design/Launch Campaign/Web/product-grid@2x.png', 'verified', 1],
  ['file-011', 'Client_Delivery_2026-07-10.zip', 'Archive', 48220 * mb, '2026-07-10 23:41', 'nonlogical', 'Deliveries/Client_Delivery_2026-07-10.zip', 'verified', 2],
  ['file-012', 'Client_Delivery_2026-07-03.zip', 'Archive', 47105 * mb, '2026-07-03 22:18', 'nonlogical', 'Deliveries/Archive/Client_Delivery_2026-07-03.zip', 'verified', 1],
  ['file-013', 'catalog-prod.sqlite3', 'Database', 6880 * mb, '2026-07-11 11:22', 'services', 'Data/Catalog/catalog-prod.sqlite3', 'verified', 2],
  ['file-014', 'catalog-prod.sqlite3-wal', 'Database', 284 * mb, '2026-07-11 12:39', 'services', 'Data/Catalog/catalog-prod.sqlite3-wal', 'pending', 1],
  ['file-015', 'Lightroom Catalog-v13.lrcat', 'Database', 1860 * mb, '2026-07-10 20:14', 'nonlogical', 'Photos/Lightroom/Lightroom Catalog-v13.lrcat', 'verified', 2],
  ['file-016', 'IMG_8421.HEIC', 'Image', 6.8 * mb, '2026-06-29 16:51', 'nonlogical', 'Photos/2026/06/California/IMG_8421.HEIC', 'verified', 3],
  ['file-017', 'IMG_8422.HEIC', 'Image', 7.1 * mb, '2026-06-29 16:52', 'nonlogical', 'Photos/2026/06/California/IMG_8422.HEIC', 'verified', 1],
  ['file-018', 'IMG_8423.HEIC', 'Image', 5.9 * mb, '2026-06-29 16:52', 'nonlogical', 'Photos/2026/06/California/IMG_8423.HEIC', 'verified', 2],
  ['file-019', 'DSC04182.ARW', 'Image', 82.4 * mb, '2026-05-18 07:33', 'nonlogical', 'Photos/2026/05/Redwoods/RAW/DSC04182.ARW', 'verified', 2],
  ['file-020', 'DSC04183.ARW', 'Image', 81.7 * mb, '2026-05-18 07:34', 'nonlogical', 'Photos/2026/05/Redwoods/RAW/DSC04183.ARW', 'verified', 1],
  ['file-021', 'Documents-2026-06.tar.zst', 'Archive', 3260 * mb, '2026-07-01 02:00', 'backup', 'Backups/Documents/Documents-2026-06.tar.zst', 'verified', 2],
  ['file-022', 'Projects-2026-06.tar.zst', 'Archive', 18940 * mb, '2026-07-01 03:12', 'backup', 'Backups/Projects/Projects-2026-06.tar.zst', 'verified', 2],
  ['file-023', 'notes-export-2026-07-11.json', 'Document', 64.2 * mb, '2026-07-11 08:15', 'nonlogical', 'Exports/Notes/notes-export-2026-07-11.json', 'pending', 1],
  ['file-024', 'font-library-backup.dmg', 'Disk image', 1380 * mb, '2026-04-22 19:06', 'nonlogical', 'Software/Archives/font-library-backup.dmg', 'verified', 2]
];

export const files = fileRows.map(([
  id,
  name,
  type,
  sizeBytes,
  modified,
  owner,
  path,
  hashStatus,
  duplicateCount
]) => ({
  id,
  name,
  type,
  kind: type.toLowerCase().replace(' ', '-'),
  size: sizeBytes,
  sizeBytes,
  modified,
  modifiedAt: modified,
  owner,
  path,
  hashStatus,
  duplicateCount,
  locationId: 'nl-media-01',
  scanId: 'scan-media-representative',
  hash: `b3:${id.slice(-3)}7d9c42a18fca682e09b4ddf1236b8e`
}));

const scanSample = (scanId, locationId, rows) => rows.map(([id, name, type, size, modified, path, hashStatus, hash]) => ({
  id,
  name,
  type,
  kind: type.toLowerCase().replace(' ', '-'),
  size,
  sizeBytes: size,
  modified,
  modifiedAt: modified,
  owner: 'system',
  path,
  hashStatus,
  duplicateCount: hashStatus === 'verified' ? 1 : 0,
  locationId,
  scanId,
  hash,
}));

export const scanFiles = {
  'scan-media-representative': files,
  'scan-media-live': scanSample('scan-media-live', 'nl-media-01', [
    ['live-001', 'Brand_Film_Conform_v21.prproj', 'Document', 148 * mb, '2026-07-11 12:41', 'Projects/Brand Film/Edit/Brand_Film_Conform_v21.prproj', 'pending', 'b3:live0010d61372e8a76fd4ae0981'],
    ['live-002', 'A003_C027_0711M8.R3D', 'Video', 14_820 * mb, '2026-07-11 12:38', 'Projects/Brand Film/Camera C/A003_C027_0711M8.R3D', 'pending', 'b3:live0021e72483f9b87ae5bf1092'],
    ['live-003', 'launch-lockup-approved.psb', 'Image', 3_104 * mb, '2026-07-11 12:34', 'Design/Launch Campaign/Final/launch-lockup-approved.psb', 'pending', 'b3:live0032f835940ac98bf6c02103'],
    ['live-004', 'client-review-0711.zip', 'Archive', 9_880 * mb, '2026-07-11 12:30', 'Deliveries/Client Review/client-review-0711.zip', 'pending', 'b3:live00430946a51bd09c07d13214'],
  ]),
  'scan-media-jul-02': scanSample('scan-media-jul-02', 'nl-media-01', [
    ['jul02-001', 'Brand_Film_Master_v12.mov', 'Video', 18_120 * mb, '2026-07-02 22:54', 'Projects/Brand Film/Exports/Brand_Film_Master_v12.mov', 'verified', 'b3:jul02001a157c62ce1ad180e24325'],
    ['jul02-002', 'Launch_Key_Art_v24.psb', 'Image', 2_612 * mb, '2026-07-02 20:12', 'Design/Launch Campaign/Working/Launch_Key_Art_v24.psb', 'verified', 'b3:jul02002b268d73df2be291f35436'],
    ['jul02-003', 'interview_maya_take_02.wav', 'Audio', 806 * mb, '2026-07-02 18:09', 'Projects/Brand Film/Audio/interview_maya_take_02.wav', 'verified', 'b3:jul02003c379e84e03cf3a2046547'],
    ['jul02-004', 'Client_Delivery_2026-07-02.zip', 'Archive', 45_980 * mb, '2026-07-02 23:01', 'Deliveries/Archive/Client_Delivery_2026-07-02.zip', 'verified', 'b3:jul02004d480f95f14d04b3157658'],
  ]),
  'scan-backup-representative': scanSample('scan-backup-representative', 'nl-backup', [
    ['backup-001', 'Brand_Film_Master_v18.mov', 'Video', 18_420 * mb, '2026-07-10 20:11', 'Media Mirror/Brand Film/Brand_Film_Master_v18.mov', 'verified', files[0].hash],
    ['backup-002', 'NLMedia-catalog-2026-07-10.sqlite3', 'Database', 7_080 * mb, '2026-07-10 20:18', 'Catalog Snapshots/NLMedia-catalog-2026-07-10.sqlite3', 'verified', 'b3:backup002e5910a6025e15c4268769'],
    ['backup-003', 'Lightroom-Mirror-2026-07-10.tar.zst', 'Archive', 28_640 * mb, '2026-07-10 19:42', 'Photo Mirror/Lightroom-Mirror-2026-07-10.tar.zst', 'verified', 'b3:backup003f6a21b7136f26d537987a'],
    ['backup-004', 'Documents-incremental-0710.tar.zst', 'Archive', 4_812 * mb, '2026-07-10 19:31', 'Backups/Documents/Documents-incremental-0710.tar.zst', 'verified', 'b3:backup00407b32c8247037e648a98b'],
  ]),
  'scan-archive-representative': scanSample('scan-archive-representative', 'archive-cold-02', [
    ['archive-001', 'Brand-Film-Camera-Originals-LTO-04.tar', 'Archive', 86_200 * mb, '2026-06-28 16:52', 'Production Archive/Brand Film/Brand-Film-Camera-Originals-LTO-04.tar', 'verified', 'b3:archive00118c43d9358148f759ba9c'],
    ['archive-002', 'Client_Deliveries_2025_Q4.tar.zst', 'Archive', 142_800 * mb, '2026-06-28 16:47', 'Client Archives/2025/Client_Deliveries_2025_Q4.tar.zst', 'verified', 'b3:archive00229d54ea469259a860cbad'],
    ['archive-003', 'Photo-Library-2019-2023.dmg', 'Disk image', 318_400 * mb, '2026-06-28 16:33', 'Photo Archive/Photo-Library-2019-2023.dmg', 'verified', 'b3:archive0033ae65fb57a36ab971dceb'],
    ['archive-004', 'design-source-history-2024.zip', 'Archive', 52_940 * mb, '2026-06-28 16:20', 'Creative Archive/2024/design-source-history-2024.zip', 'verified', 'b3:archive0044bf760c68b47bca82edfc'],
  ]),
};

export const locationTree = [
  {
    id: 'projects',
    name: 'Projects',
    count: 162408,
    children: [
      { id: 'brand-film', name: 'Brand Film', count: 18426 },
      { id: 'client-work', name: 'Client Work', count: 97340 },
      { id: 'internal', name: 'Internal', count: 46642 }
    ]
  },
  {
    id: 'photos',
    name: 'Photos',
    count: 188552,
    children: [
      { id: 'photos-2026', name: '2026', count: 42381 },
      { id: 'lightroom', name: 'Lightroom', count: 924 },
      { id: 'photo-archive', name: 'Archive', count: 145247 }
    ]
  },
  { id: 'design', name: 'Design', count: 24818, children: [] },
  { id: 'deliveries', name: 'Deliveries', count: 1284, children: [] },
  { id: 'data', name: 'Data', count: 5102, children: [] },
  { id: 'backups', name: 'Backups', count: 35708, children: [] }
];

export const duplicateGroups = [
  {
    id: 'dup-beach-image',
    hash: 'b3:4053988039bf7cbe514457a90b4f25d8',
    kind: 'Image',
    size: 3_204_812,
    sizeBytes: 3_204_812,
    count: 2,
    reclaimableBytes: 3_204_812,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[15], id: 'dup-file-001', name: 'beach.JPG', path: 'Photos/Old Photos.photoslibrary/originals/beach.JPG', type: 'Image', kind: 'image', size: 3_204_812, sizeBytes: 3_204_812, locationName: 'NLMedia 01' },
      { ...files[15], id: 'dup-file-002', name: 'beach.JPG', path: 'Photo Mirror/Old Photos/originals/beach.JPG', type: 'Image', kind: 'image', size: 3_204_812, sizeBytes: 3_204_812, locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' }
    ]
  },
  {
    id: 'dup-brand-film-master',
    hash: files[0].hash,
    kind: 'Video',
    size: files[0].size,
    sizeBytes: files[0].size,
    count: 2,
    reclaimableBytes: files[0].size,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[0], id: 'dup-brand-film-primary', locationName: 'NLMedia 01' },
      { ...scanFiles['scan-backup-representative'][0], id: 'dup-brand-film-backup', locationName: 'NLBackup' }
    ]
  },
  {
    id: 'dup-archive-video',
    hash: 'b3:8dcf620099ff1ba44537c52d0fe08fb7',
    kind: 'Video',
    size: 92_110_820,
    sizeBytes: 92_110_820,
    count: 2,
    reclaimableBytes: 92_110_820,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[2], id: 'dup-file-003', name: 'archive.mov', path: 'Projects/Brand Film/Archive/archive.mov', type: 'Video', kind: 'video', size: 92_110_820, sizeBytes: 92_110_820, locationName: 'NLMedia 01' },
      { ...files[2], id: 'dup-file-004', name: 'archive.mov', path: 'Media Mirror/Brand Film/archive.mov', type: 'Video', kind: 'video', size: 92_110_820, sizeBytes: 92_110_820, locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' }
    ]
  },
  {
    id: 'dup-export-archive',
    hash: 'b3:99aaab90c51d7c2f2782d9089c1134f2',
    kind: 'Archive',
    size: 50_562_334_720,
    sizeBytes: 50_562_334_720,
    count: 3,
    reclaimableBytes: 101_124_669_440,
    locations: ['NLMedia 01', 'NLBackup', 'Archive Cold 02'],
    files: [
      { ...files[10], id: 'dup-file-005', locationName: 'NLMedia 01' },
      { ...files[10], id: 'dup-file-006', path: 'Delivery Mirror/Client_Delivery_2026-07-10.zip', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' },
      { ...files[10], id: 'dup-file-007', path: 'Client Archives/2026/Client_Delivery_2026-07-10.zip', locationId: 'archive-cold-02', scanId: 'scan-archive-representative', locationName: 'Archive Cold 02' }
    ]
  },
  {
    id: 'dup-launch-key-art',
    hash: 'b3:2a91df70b147f3bd09808f3613a218b4',
    kind: 'Image',
    size: 2_978_283_520,
    sizeBytes: 2_978_283_520,
    count: 3,
    reclaimableBytes: 5_956_567_040,
    locations: ['NLMedia 01', 'NLBackup', 'Archive Cold 02'],
    files: [
      { ...files[6], id: 'dup-file-008', locationName: 'NLMedia 01' },
      { ...files[6], id: 'dup-file-009', path: 'Design Mirror/Launch Campaign/Launch_Key_Art_Final.psb', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' },
      { ...files[6], id: 'dup-file-010', path: 'Creative Archive/2026/Launch_Key_Art_Final.psb', locationId: 'archive-cold-02', scanId: 'scan-archive-representative', locationName: 'Archive Cold 02' }
    ]
  },
  {
    id: 'dup-homepage-hero',
    hash: 'b3:67409fb9b805e532ce6597784bb25cf1',
    kind: 'Image',
    size: 19_503_514,
    sizeBytes: 19_503_514,
    count: 3,
    reclaimableBytes: 39_007_028,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[8], id: 'dup-file-011', locationName: 'NLMedia 01' },
      { ...files[8], id: 'dup-file-012', path: 'Web Staging/Launch/homepage-hero@2x.png', locationName: 'NLMedia 01' },
      { ...files[8], id: 'dup-file-013', path: 'Design Mirror/Launch/homepage-hero@2x.png', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' }
    ]
  },
  {
    id: 'dup-catalog-database',
    hash: 'b3:1c5731b44c73abed73675165d5da8314',
    kind: 'Database',
    size: 7_214_612_480,
    sizeBytes: 7_214_612_480,
    count: 2,
    reclaimableBytes: 7_214_612_480,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[12], id: 'dup-file-014', locationName: 'NLMedia 01' },
      { ...files[12], id: 'dup-file-015', path: 'Service Backups/Catalog/catalog-prod.sqlite3', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' }
    ]
  },
  {
    id: 'dup-lightroom-catalog',
    hash: 'b3:5f34c598d096c1a89dc83b198315e4a6',
    kind: 'Database',
    size: 1_950_351_360,
    sizeBytes: 1_950_351_360,
    count: 2,
    reclaimableBytes: 1_950_351_360,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[14], id: 'dup-file-016', locationName: 'NLMedia 01' },
      { ...files[14], id: 'dup-file-017', path: 'Photo Mirror/Lightroom/Lightroom Catalog-v13.lrcat', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' }
    ]
  },
  {
    id: 'dup-documents-backup',
    hash: 'b3:53f8b12e6da21771ccf6177e52f1944d',
    kind: 'Archive',
    size: 3_418_357_760,
    sizeBytes: 3_418_357_760,
    count: 3,
    reclaimableBytes: 6_836_715_520,
    locations: ['NLMedia 01', 'NLBackup', 'Archive Cold 02'],
    files: [
      { ...files[20], id: 'dup-file-018', locationName: 'NLMedia 01' },
      { ...files[20], id: 'dup-file-019', path: 'Monthly Mirrors/Documents-2026-06.tar.zst', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' },
      { ...files[20], id: 'dup-file-020', path: 'Backups/2026/06/Documents-2026-06.tar.zst', locationId: 'archive-cold-02', scanId: 'scan-archive-representative', locationName: 'Archive Cold 02' }
    ]
  },
  {
    id: 'dup-interview-audio',
    hash: 'b3:90cbdd836f8e42a7cadcc0f1e56bd319',
    kind: 'Audio',
    size: 864_026_624,
    sizeBytes: 864_026_624,
    count: 2,
    reclaimableBytes: 864_026_624,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[4], id: 'dup-file-021', locationName: 'NLMedia 01' },
      { ...files[4], id: 'dup-file-022', path: 'Audio Mirror/Brand Film/interview_maya_take_03.wav', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' }
    ]
  },
  {
    id: 'dup-redwoods-raw',
    hash: 'b3:dcc2927af92dd903168c6a0af3f519c3',
    kind: 'Image',
    size: 86_402_662,
    sizeBytes: 86_402_662,
    count: 2,
    reclaimableBytes: 86_402_662,
    locations: ['NLMedia 01', 'NLBackup'],
    files: [
      { ...files[18], id: 'dup-file-023', locationName: 'NLMedia 01' },
      { ...files[18], id: 'dup-file-024', path: 'Photo Mirror/2026/05/Redwoods/DSC04182.ARW', locationId: 'nl-backup', scanId: 'scan-backup-representative', locationName: 'NLBackup' }
    ]
  }
];

export const tasks = [
  {
    id: 'task-scan-media',
    type: 'scan',
    kind: 'Location scan',
    title: 'Scanning NLMedia 01',
    subtitle: 'Metadata and content hashing',
    locationId: 'nl-media-01',
    locationName: 'NLMedia 01',
    status: 'running',
    phase: 'metadata',
    progress: 68,
    processed: 283444,
    total: 417892,
    rate: '1,248 files/s',
    eta: '1m 48s',
    startedAt: '12:42 PM',
    errors: 2,
    queued: 134448,
    cancellable: true
  },
  {
    id: 'task-exif-metadata',
    type: 'metadata',
    kind: 'EXIF metadata',
    title: 'Extracting EXIF metadata',
    subtitle: 'NLBackup photo archive',
    locationId: 'nl-backup',
    locationName: 'NLBackup',
    status: 'queued',
    phase: 'queued',
    progress: 0,
    processed: 0,
    total: 48210,
    rate: 'Waiting',
    eta: '—',
    startedAt: 'Queued 12:46 PM',
    errors: 0,
    queued: 48210,
    cancellable: true
  },
  {
    id: 'task-hash-backup',
    type: 'checksum',
    kind: 'Content hashing',
    title: 'Hashing NLBackup changes',
    subtitle: 'Incremental BLAKE3 verification',
    locationId: 'nl-backup',
    locationName: 'NLBackup',
    status: 'running',
    phase: 'content hashing',
    progress: 44,
    processed: 86940,
    total: 197804,
    rate: '816 files/s',
    eta: '2m 16s',
    startedAt: '12:44 PM',
    errors: 0,
    queued: 110864,
    cancellable: true
  },
  {
    id: 'task-verify-archive',
    type: 'scan',
    kind: 'Location scan',
    title: 'Verifying Archive Cold 02',
    subtitle: 'Paused after volume disconnect',
    locationId: 'archive-cold-02',
    locationName: 'Archive Cold 02',
    status: 'paused',
    phase: 'Paused by operator',
    progress: 37,
    processed: 384290,
    total: 1038812,
    rate: 'Paused',
    eta: '—',
    startedAt: '11:58 AM',
    errors: 6,
    queued: 654522,
    cancellable: true
  },
  {
    id: 'task-thumbnail-cache',
    type: 'metadata',
    kind: 'Thumbnail metadata',
    title: 'Building thumbnail index',
    subtitle: 'NLMedia 01 image previews',
    locationId: 'nl-media-01',
    locationName: 'NLMedia 01',
    status: 'queued',
    phase: 'queued',
    progress: 0,
    processed: 0,
    total: 92318,
    rate: 'Waiting',
    eta: '—',
    startedAt: 'Queued 12:47 PM',
    errors: 0,
    queued: 92318,
    cancellable: true
  },
  {
    id: 'task-duplicate-refresh',
    type: 'analysis',
    kind: 'Duplicate analysis',
    title: 'Refreshing duplicate groups',
    subtitle: 'Representative scans across 3 locations',
    locationId: null,
    locationName: '3 locations',
    status: 'queued',
    phase: 'queued',
    progress: 0,
    processed: 0,
    total: 1078422,
    rate: 'Waiting',
    eta: '—',
    startedAt: 'Queued 12:48 PM',
    errors: 0,
    queued: 1078422,
    cancellable: true
  },
  {
    id: 'task-duplicates',
    type: 'analysis',
    kind: 'Duplicate analysis',
    title: 'Compared representative scans',
    subtitle: 'NLMedia 01, NLBackup, Archive Cold 02',
    locationId: null,
    locationName: '3 locations',
    status: 'complete',
    phase: 'complete',
    progress: 100,
    processed: 1078422,
    total: 1078422,
    rate: 'Complete',
    eta: '—',
    startedAt: 'Today, 11:02 AM',
    finishedAt: 'Today, 11:04 AM',
    errors: 0,
    queued: 0,
    cancellable: false
  },
  {
    id: 'task-scan-backup',
    type: 'scan',
    kind: 'Location scan',
    title: 'Scanned NLBackup',
    subtitle: 'Representative scan updated',
    locationId: 'nl-backup',
    locationName: 'NLBackup',
    status: 'complete',
    phase: 'complete',
    progress: 100,
    processed: 612508,
    total: 612508,
    rate: 'Complete',
    eta: '—',
    startedAt: 'Yesterday, 8:18 PM',
    finishedAt: 'Yesterday, 9:26 PM',
    errors: 0,
    queued: 0,
    cancellable: false
  }
];

export const recentEvents = [
  { id: 'event-01', taskId: 'task-scan-media', time: '12:48:31 PM', status: 'info', message: 'Metadata queue passed 280,000 files' },
  { id: 'event-02', taskId: 'task-scan-media', time: '12:47:58 PM', status: 'warning', message: 'Could not read extended attributes for 2 files' },
  { id: 'event-03', taskId: 'task-scan-media', time: '12:47:22 PM', status: 'running', message: 'Worker 03 started reading media metadata' },
  { id: 'event-04', taskId: 'task-scan-media', time: '12:46:49 PM', status: 'info', message: 'Content hash queue passed 240,000 files' },
  { id: 'event-05', taskId: 'task-scan-media', time: '12:45:36 PM', status: 'running', message: 'Worker pool increased from 3 to 4 workers' },
  { id: 'event-06', taskId: 'task-scan-media', time: '12:44:17 PM', status: 'info', message: 'Excluded 14 configured cache directories' },
  { id: 'event-07', taskId: 'task-scan-media', time: '12:43:52 PM', status: 'running', message: 'Content hashing phase started' },
  { id: 'event-08', taskId: 'task-scan-media', time: '12:43:08 PM', status: 'success', message: 'Directory walk completed: 18,422 folders found' },
  { id: 'event-09', taskId: 'task-scan-media', time: '12:42:36 PM', status: 'info', message: 'Mounted volume health check passed' },
  { id: 'event-10', taskId: 'task-scan-media', time: '12:42:04 PM', status: 'success', message: 'Discovery started for 417,892 indexed files' },
  { id: 'event-11', taskId: 'task-exif-metadata', time: '12:46:22 PM', status: 'queued', message: 'EXIF metadata job added to the work queue' },
  { id: 'event-12', taskId: 'task-hash-backup', time: '12:44:09 PM', status: 'running', message: 'Incremental hashing started with 4 workers' },
  { id: 'event-13', taskId: 'task-verify-archive', time: '12:39:40 PM', status: 'paused', message: 'Operator paused verification after volume disconnect' },
  { id: 'event-14', taskId: 'task-thumbnail-cache', time: '12:47:16 PM', status: 'queued', message: 'Thumbnail index queued behind EXIF extraction' },
  { id: 'event-15', taskId: 'task-duplicate-refresh', time: '12:48:02 PM', status: 'queued', message: 'Duplicate refresh queued for representative scans' },
  { id: 'event-16', taskId: 'task-duplicates', time: '11:04:18 AM', status: 'success', message: 'Duplicate comparison completed across 3 locations' },
  { id: 'event-17', taskId: 'task-scan-backup', time: 'Yesterday', status: 'success', message: 'NLBackup representative scan updated' }
];
