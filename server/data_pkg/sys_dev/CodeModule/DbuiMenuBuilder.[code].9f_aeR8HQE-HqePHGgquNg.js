function (db, auth, Q, _) {
    var exports = {};
    
    /**
     * DbuiMenuBuilder.buildMenu
     * takes a key, queryies for the menu, and dereferences any submenus
     * @return array of objects
     */ 
    var buildMenu = 
    exports.buildMenu = function(key, user) {
        
      //Helper function - called when a submenu is built;
      var dereferenceMenu = function(menuObj) {
          
        //this -> bound to the menu item w/ the "ref"
        if(menuObj && menuObj.length > 0)
          this.submenu = menuObj;
      }
    
      //Helper function - populates labels for a ref menuItem (bound to 'this')
      var populateLabels = function() {
        var menuItem = this;
        return db.LabelGroup.findOne({key:this.ref}).then(
          function(labelGroupObj) {
            if(labelGroupObj) {
              var lg = labelGroupObj.value;
    
              //First, check this menu item
              if(lg._submenu_label)
                menuItem.label = lg._submenu_label;
              else
                menuItem.label = menuItem.ref;
    
              //Then, submenu labels...
              if(menuItem.submenu) {
                for(var i=0; i < menuItem.submenu.length; i++) {
                  var itemLabel = menuItem.submenu[i].label;
                  if(itemLabel && lg[itemLabel])
                    menuItem.submenu[i].label = lg[itemLabel];
                }
              }
            }
          });
      }
    
      var cleanupMenu = function(menuItemList) {
          
        for(var i=0; i < menuItemList.length; i++) {
          var m = menuItemList[i];
          if(!m.action && !m.submenu) {
            menuItemList.splice(i, 1);
            i--;
          }
        }
        return menuItemList;
      }
    
      return db.Menu.find({key:key}).then(
        function(results) {
          var menuToReturn = [];
          var promiseList = [];
    
          //Iterate through the Menu objects that matched our key...
          for(var i=0; i < results.length; i++) {
            var menuObj = results[i];
    
            //Check the roles  TODO possibly use $satisfies query instead...
            if(!menuObj.rolespec || auth.checkRolesForUser(user, menuObj.rolespec)) {
              var menuDef = menuObj.definition || [];
              if(!Array.isArray(menuDef))
                menuDef = [menuDef];
    
              //Pull in the menu items
              for(var j=0; j<menuDef.length; j++) {
                var menuItem = menuDef[j];
                menuToReturn.push(menuItem);
    
                if(menuItem.ref) {
                  //Dereference, and populate labels
                  promiseList.push(
                    buildMenu(menuItem.ref, user)
                      .then(dereferenceMenu.bind(menuItem))
                      .then(populateLabels.bind(menuItem))
                  );
                }
              }
    
    
            }
          }
    
          if(promiseList.length > 0)
            return Q.all(promiseList).then(function() { return cleanupMenu(menuToReturn)});
          else
            return cleanupMenu(menuToReturn);
    
        });
    
    };
    
    return exports;
}