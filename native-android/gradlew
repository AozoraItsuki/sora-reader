#!/usr/bin/env sh
APP_HOME=$(dirname "$0")
APP_HOME=$(cd "$APP_HOME" && pwd)
WRAPPER_JAR="$APP_HOME/gradle/wrapper/gradle-wrapper.jar"
if [ ! -f "$WRAPPER_JAR" ]; then
  echo "gradle-wrapper.jar not found. Run: gradle wrapper --gradle-version 8.11.1" >&2
  echo "Or open the project in Android Studio to generate it." >&2
  exit 1
fi
exec java -jar "$WRAPPER_JAR" "$@"
