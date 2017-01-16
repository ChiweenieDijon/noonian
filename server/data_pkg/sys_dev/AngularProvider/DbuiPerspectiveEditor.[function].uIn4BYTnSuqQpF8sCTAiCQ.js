function ($uibModal, $rootScope) {
    
    var perspectiveEditorController = function ($scope, $timeout, $q, db,  NoonI18n,  DbuiFieldType) {
        var className = $scope.className;
        var perspectiveObj = $scope.perspectiveObj;
        var labels = NoonI18n.getBoLabelGroup(className);
        
        var fieldList = $scope.fieldList = perspectiveObj.fields;
        
        var availableFields;
        var availableFieldMap = {};
        var indexAvailableFields = function() {
            for(var i=0; i< availableFields.length; i++) {
                availableFieldMap[availableFields[i].fieldName] = availableFields[i];
            }
        };
        
        
        DbuiFieldType.getAugmentedFieldList(className, true).then(function(fieldInfoList) {
            availableFields = $scope.availableFields = fieldInfoList;
            indexAvailableFields();
            
            for(var i=0; i< fieldList.length; i++) {
                var fi = availableFieldMap[fieldList[i]];
                if(fi) {
                    fi.included = true;
                }
                else if(fieldList[i].indexOf('.') > -1) {
                    //need to expand a ref field...
                    var dotPos = fieldList[i].indexOf('.');
                    var fieldName = fieldList[i].substring(0, dotPos+1);
                    fi = availableFieldMap[fieldName];
                    
                    if(fi) {
                        fi.expand();
                        indexAvailableFields();
                        i--;
                        continue;
                    }
                }
            }
        });
        
        $scope.selectedIndex = -1;
        
        $scope.addField = function(fieldInfo) {
            if(!fieldInfo.refPlaceholder) {
                fieldInfo.included = true;
                fieldList.push(fieldInfo.fieldName);
                $scope.selectedIndex = fieldList.length - 1;
            }
            else {
                fieldInfo.expand();
                indexAvailableFields();
            }
        };
        
        $scope.moveUp = function() {
            var idx = $scope.selectedIndex;
            var obj = fieldList[idx];
            fieldList.splice(idx, 1); //Remove from it's current position
            fieldList.splice(idx-1, 0, obj); //insert it one higher
        
            $scope.selectedIndex--;
        };
        $scope.moveDown = function() {
            var idx = $scope.selectedIndex;
            var obj = fieldList[idx];
            fieldList.splice(idx, 1); //Remove from it's current position
            fieldList.splice(idx+1, 0, obj); //insert it one lower
        
            $scope.selectedIndex++;
        };
        
        $scope.remove = function(index) {
            var fieldName = fieldList[index];
            fieldList.splice(index, 1);
            availableFieldMap[fieldName].included = false;
            if(index === $scope.selectedIndex) {
                $scope.selectedIndex = -1;
            }
        };
        
        $scope.selectedForMove = function(fieldIndex) {
            return fieldIndex === $scope.selectedIndex;
        };
        
        $scope.selectForMove = function(fieldIndex) {
            $scope.selectedIndex = fieldIndex;
        };
        
        $scope.canMoveUp = function() {
            return $scope.selectedIndex > 0;
        };
        
        $scope.canMoveDown = function() {
            return $scope.selectedIndex >= 0 && $scope.selectedIndex < fieldList.length -1;
        };
        
        $scope.getFieldLabel = function(fieldName) {
            return (labels._abbreviated  && labels._abbreviated[fieldName]) || labels[fieldName] || fieldName;
        };
    };
    
    
    /**
     * DbuiPerspectiveEditor.showEditorDialog()
     * 
     * @param {string} className - name of the business object class to whom the perspective applies
     * @param {Perspective} perspectiveObj - object whose fields are being edited
     * @param {string} perspectiveType - type (list, edit, view, ...)
     * @return the uibModal "result" promise, resolved when the dialog is closed.
     * 
     */
    this.showEditorDialog = function(className, perspectiveObj, perspectiveType) {
        
        var modalInstance;
        var scope = $rootScope.$new(true);
        
        scope.title = 'Edit Perspective for '+className;
        scope.className = className;
        scope.perspectiveObj = perspectiveObj;
        scope.perspectiveType = perspectiveType;
        
        return $uibModal.open({
            templateUrl:'dbui/reusable/dialog/perspective_editor.html',
            size:'lg',
            scope: scope,
            controller:perspectiveEditorController
        }).result;
    
    };
        
}