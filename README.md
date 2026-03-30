# ClipShare 📋

Partage instantané de texte et de liens entre tes appareils, sans compte, sans installation.

🔗 **Live** → [anonyme-afk.github.io/ClipShare](https://anonyme-afk.github.io/ClipShare/)

---

## Fonctionnalités

- **Salons privés** — Crée un salon et reçois un code à 6 chiffres unique
- **Temps réel** — Tout ce qui est envoyé apparaît instantanément sur tous les appareils connectés
- **Multi-utilisateurs** — Plusieurs personnes peuvent rejoindre le même salon avec le même code
- **Isolation totale** — Les salons sont complètement séparés, impossible de voir les messages d'un autre salon
- **Nettoyage automatique** — Quand tout le monde quitte un salon, les messages sont supprimés automatiquement
- **TTL 1 heure** — Les messages expirent après 1h même si personne ne quitte
- **Aucune donnée personnelle** — Pas de compte, pas de nom, pas d'email, rien de stocké
- **Mode sombre** — Thème clair/sombre intégré

---

## Comment ça marche

1. Ouvre le site sur ton **ordinateur** → clique sur **Create New Room**
2. Un code à 6 chiffres est généré
3. Sur ton **téléphone**, entre ce code → clique sur **Join Room**
4. Les deux appareils sont connectés — envoie du texte, des liens, du code...
5. Clique sur **Leave Room** quand tu as fini, la salle se vide automatiquement

---

## Tech

- **Frontend** — React + TypeScript + Vite + Tailwind CSS
- **Base de données temps réel** — Firebase Realtime Database
- **Hébergement** — GitHub Pages (gratuit, sans serveur)
- **Sécurité** — Firebase Security Rules + code aléatoire cryptographique (`crypto.getRandomValues`)

