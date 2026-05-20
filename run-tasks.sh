#!/bin/bash

JSON_FILE="tasks.json"

if [ ! -f "$JSON_FILE" ]; then
  echo "Fehler: $JSON_FILE nicht gefunden!"
  exit 1
fi

if ! command -v jq &> /dev/null; then
  echo "Fehler: 'jq' wird benötigt. Bitte in WSL installieren mit: sudo apt install jq"
  exit 1
fi


echo "🚀 Starte OpenCode Task Runner in WSL auf Branch: "

TASK_COUNT=$(jq '. | length' "$JSON_FILE")
echo "📋 $TASK_COUNT Tasks in der Warteschlange gefunden."

for ((i=0; i<$TASK_COUNT; i++)); do
  TITLE=$(jq -r ".[$i].title" "$JSON_FILE")
  ID=$(jq -r ".[$i].id" "$JSON_FILE")
  INSTRUCTION=$(jq -r ".[$i].instruction" "$JSON_FILE")

  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "🔧 Task [$ID/$TASK_COUNT]: $TITLE"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

  # Ausführung über die WSL-interne OpenCode-Installation (ohne -q)
  opencode run "
    Task-Titel: $TITLE
    Anweisung: $INSTRUCTION
  "

  if [ $? -eq 0 ]; then
    echo "✅ OpenCode erfolgreich. Committe Änderungen in WSL..."
    git add .
    git commit -m "feat(task-$ID): $TITLE"
  else
    echo "❌ Fehler bei Task $ID ($TITLE). Script stoppt."
    exit 1
  fi
done

echo ""
echo "🎉 Alle Tasks erfolgreich nacheinander in WSL auf Branch '$CURRENT_BRANCH' abgearbeitet!"