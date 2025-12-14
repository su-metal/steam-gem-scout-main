 = 'https://gfejumzkviknhyhjdpxn.supabase.co'
 = 'eyJhbGciOiJIUzI1NiIsInJlZiI6ImdmZWp1bXprdmlrbmh5aGpkcHhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MzE3NzI5NCwiZXhwIjoyMDc4NzUzMjk0fQ.-gwoeUEQHaAHFWbtfue0yMUCu5F_fuY1QcjJxFJ7kCc'
Start-Job -Name supafunc -ScriptBlock { supabase functions serve }
Start-Sleep -Seconds 5
