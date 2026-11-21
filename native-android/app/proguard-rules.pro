# Keep kotlinx.serialization generated serializers
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt

-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}

-keep,includedescriptorclasses class app.sorareader.**$$serializer { *; }
-keepclassmembers class app.sorareader.** {
    *** Companion;
}
-keepclasseswithmembers class app.sorareader.** {
    kotlinx.serialization.KSerializer serializer(...);
}
