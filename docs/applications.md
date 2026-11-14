# Vos applications LifeOS

LifeOS réunit vos applications personnelles dans un même espace. Après connexion, l’**Accueil** présente uniquement vos applications activées. Choisissez **Ouvrir** sur une carte pour accéder à son contenu.

## Choisir ses applications

1. Ouvrir **Bibliothèque** dans la navigation, ou **Gérer mes applications** depuis l’accueil.
2. Utiliser l’interrupteur **Activer / Désactiver** sur la carte d’une application.
3. Revenir à l’accueil : la liste reflète immédiatement le choix enregistré.

Le réglage appartient à votre compte et persiste après rechargement, déconnexion et sur vos autres appareils. La bibliothèque affiche l’état enregistré et signale les erreurs ; une erreur réseau ne présente pas un changement comme réussi. Les interrupteurs fonctionnent aussi au clavier (Tab puis Espace).

Une désactivation ne supprime **aucune donnée** : espaces, tâches, archives, échéances, récurrences, préférences et historique restent conservés. L’application disparaît de l’accueil et son accès est bloqué. Un lien direct comme `/tasks?space=…` propose d’ouvrir la bibliothèque. Réactivez l’application pour retrouver vos données. Désactiver n’archive pas les tâches et ne change pas leurs dates.

Si toutes les applications sont désactivées, l’accueil propose d’explorer la bibliothèque. La connexion, le thème et la bibliothèque restent disponibles. Un onglet déjà ouvert actualise le catalogue quand il revient au premier plan ; une requête métier refusée après désactivation affiche également le retour à la bibliothèque. Il n’y a pas de synchronisation instantanée entre appareils.

## Applications disponibles

**Tâches** est la première application livrée : [espaces, agenda, listes, kanban et récurrences](taches.md). Elle est activée par défaut, y compris pour les comptes et données existants.

Le sport, les objectifs OKR, les tâches ménagères et les plantes sont des pistes futures. Ils ne sont pas encore disponibles ni activables. Une nouvelle application apparaîtra dans la bibliothèque lors de sa livraison et sera désactivée par défaut.

## Connexion et apparence

L’accueil, la bibliothèque et les applications partagent la même connexion et le thème clair/sombre/système. Le menu du compte permet de changer l’apparence ou de se déconnecter. Une session expirée ramène au formulaire de connexion et retire les données privées de l’écran. Les pages HTML ne contiennent aucune donnée personnelle ; elles sont chargées par l’API après connexion.

Le catalogue et l’activation sont aussi accessibles par l’[API versionnée](api.md#bibliotheque-et-activation), indépendamment de l’interface.
