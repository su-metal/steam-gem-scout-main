from pathlib import Path
text = Path('src/components/SearchResultCard.tsx').read_text(encoding='utf-8')
start = text.index('  return (')
end = text.index('  );', start)
print(start, end)

