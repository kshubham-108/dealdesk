-- Kerbside test listings (re-runnable: clears existing sandbox listings first,
-- which cascades to their deals/messages/approvals/events).
delete from listings where source = 'sandbox';

insert into listings (
  id, source, platform, url, title, description, category, condition, asking_price,
  location, seller_name, seller_mode, persona, floor_price, known_issue, issue_severity,
  seller_rating, seller_reviews_count, seller_since, seller_reviews, seller_feedback, emoji
) values
(
  '00000000-0000-0000-0000-000000000001', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000001',
  'Specialized Allez, 54cm, Shimano Sora',
  'Specialized Allez road bike, 54cm frame with Shimano Sora groupset. Great for commuting and weekend rides, well maintained throughout.',
  'bike', 'very good', 260, 'Hackney, E8', 'Frank', 'agent', 'agent_fair', 225,
  'No damage. Serviced in August with new tyres.', 'none',
  4.9, 48, '2021-03-01',
  array['Bike exactly as described, easy collection.', 'Friendly and quick to reply.'],
  null, '🚲'
),
(
  '00000000-0000-0000-0000-000000000002', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000002',
  'Canyon Endurace AL, 54cm, Shimano 105',
  'Canyon Endurace AL endurance road bike, size 54cm, Shimano 105 groupset. Comfortable geometry, ridden regularly and kept in good working order.',
  'bike', 'good', 300, 'Shoreditch, E1', 'Hana', 'agent', 'agent_haggler', 240,
  'A small scuff on the top tube, and the brake pads are due for replacing.', 'minor',
  4.7, 21, '2022-05-01',
  array['Good bike, a few more scuffs than the photos showed.', 'Chatty seller, fair price in the end.'],
  null, '🚲'
),
(
  '00000000-0000-0000-0000-000000000003', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000003',
  'Giant Contend 2, size M (54cm)',
  'Giant Contend 2 road bike, size Medium (54cm). Reliable aluminium frame, ideal for fitness rides and commuting, garage kept.',
  'bike', 'very good', 285, 'Bethnal Green, E2', 'Fiona', 'agent', 'agent_firm', 275,
  'No issues, it''s been garage kept.', 'none',
  4.8, 35, '2020-01-15',
  array['Knows her bikes, firm on price.', 'Smooth sale.'],
  null, '🚲'
),
(
  '00000000-0000-0000-0000-000000000004', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000004',
  'Cannondale CAAD Optimo, 54cm',
  'Cannondale CAAD Optimo road bike, 54cm frame. Light aluminium build, good for both commuting and longer rides.',
  'bike', 'good', 210, 'Mile End, E3', 'Gary', 'human', 'human_ghost', 190,
  null, 'none',
  3.4, 6, '2023-02-01',
  array['Never replied to my last message.', 'Nice bike but slow to reply.'],
  null, '🚲'
),
(
  '00000000-0000-0000-0000-000000000005', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000005',
  'Boardman SLR carbon, 54cm, as new',
  'Boardman SLR carbon road bike, 54cm, as new condition. Barely used, selling due to house move.',
  'bike', 'like new', 120, 'Stratford, E15', 'Sam', 'human', 'human_scammer', null,
  null, 'none',
  null, 0, '2026-09-24',
  array[]::text[],
  null, '🚲'
),
(
  '00000000-0000-0000-0000-000000000006', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000006',
  'Ribble Endurance AL, 54cm',
  'Ribble Endurance AL road bike, 54cm frame. Versatile all-rounder, well looked after and ready to ride.',
  'bike', 'good', 230, 'Bow, E3', 'Sally', 'human', 'human_sold', 210,
  null, 'none',
  4.6, 12, '2022-06-01',
  array['Sold quickly, lovely seller.', 'Great communication.'],
  null, '🚲'
),
(
  '00000000-0000-0000-0000-000000000007', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000007',
  'Trek Domane AL 2, 58cm',
  'Trek Domane AL 2 endurance road bike, 58cm frame. Smooth ride with endurance geometry, great for longer distances.',
  'bike', 'good', 240, 'Leyton, E10', 'Dave', 'agent', 'agent_fair', 215,
  'No issues.', 'none',
  4.8, 30, '2021-07-01',
  array['Great seller.'],
  null, '🚲'
),
(
  '00000000-0000-0000-0000-000000000008', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000008',
  'PS5 Slim (disc), two controllers',
  'PS5 Slim console with disc drive, includes two controllers. Barely used, all cables and original box included.',
  'console', 'very good', 320, 'Whitechapel, E1', 'Priya', 'agent', 'agent_fair', 285,
  'No issues.', 'none',
  4.9, 60, '2020-09-01',
  array['Fast, friendly, as described.'],
  null, '🎮'
),
(
  '00000000-0000-0000-0000-000000000009', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000009',
  'IKEA Alex desk, white',
  'IKEA Alex desk in white, drawer unit with lock. Sturdy and practical, ideal for a home office setup.',
  'furniture', 'good', 45, 'Stepney, E1', 'Tom', 'agent', 'agent_fair', 35,
  'One small mark on the top.', 'minor',
  4.5, 9, '2024-01-10',
  array['Easy pickup.'],
  null, '🪑'
),
(
  '00000000-0000-0000-0000-000000000010', 'sandbox', 'Kerbside (test)',
  '/market/00000000-0000-0000-0000-000000000010',
  'Carhartt Detroit jacket, size L, vintage',
  'Carhartt Detroit jacket, size L, vintage wash. Classic workwear style, warm blanket lining.',
  'clothing', 'good', 85, 'Dalston, E8', 'Leo', 'agent', 'agent_haggler', 70,
  'Light fading on the collar.', 'minor',
  4.7, 18, '2023-04-01',
  array['Great vintage finds.'],
  null, '🧥'
);
