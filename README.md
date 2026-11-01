# AIKO

AIKO est une application web progressive (PWA) en français, pensée pour être installée sur iPhone depuis Safari.

## Fonctionnalités de cette version

- Accès sans adresse e-mail : pseudo unique + code secret (8 caractères minimum), gérés par Supabase Auth côté serveur.
- Conversations privées enregistrées dans Supabase.
- Six personnalités intégrées : Douce, Tsundere, Enjouée, Sage, Directe et Créative.
- Création de personnalités personnalisées.
- Appels au modèle IA via une Supabase Edge Function ; la clé OpenAI reste côté serveur.
- Interface responsive et cache PWA de base.

## Configuration nécessaire

1. Le projet Supabase doit conserver les tables `profiles`, `conversations`, `messages` et `custom_personas`, avec les politiques RLS associées.
2. Dans Supabase > Edge Functions > Secrets, ajouter `OPENAI_API_KEY` avec une clé API OpenAI valide. Ne jamais placer cette clé dans le code du navigateur ou dans GitHub.
3. Vérifier que la fonction Edge `aiko-chat` est déployée.
4. Vérifier que les fonctions Edge `aiko-access` et `aiko-chat` sont déployées.
5. Activer GitHub Pages sur la branche de production souhaitée (généralement `main`, dossier racine).

## Installer sur iPhone

Ouvrir le site dans Safari, toucher Partager, puis « Sur l'écran d'accueil ».

## Développement

Le frontend utilise le client Supabase JS chargé depuis esm.sh. Les paramètres publics du projet Supabase sont dans `app.js`. La clé publishable est conçue pour être utilisée dans un navigateur ; la sécurité des données repose sur RLS. Les clés secrètes ne doivent jamais être exposées au frontend.

## À savoir

La synthèse vocale, les conversations vocales et le partage de fichiers ne sont pas encore implémentés dans cette version. L'application nécessite une connexion Internet pour la connexion et les réponses IA. Le code secret est le seul moyen de retrouver un espace : il n'y a pas de récupération par e-mail. Choisir un code long et difficile à deviner.
