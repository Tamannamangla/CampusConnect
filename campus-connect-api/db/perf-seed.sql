INSERT INTO events (title, club, category, event_date, seats)
SELECT 'Perf Event ' || g, 'Perf Club',
       (ARRAY['Tech', 'Cultural', 'Sports'])[1 + g % 3],
       DATE '2027-01-01' + (g % 300), 100
FROM generate_series(1, 5000) AS g;
